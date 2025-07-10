'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, X, Image } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SiteDiaryTemplate, SiteDiaryTemplateItem } from '@/lib/types/site-diary';
import { getSiteDiaryTemplateById, createSiteDiary } from '@/lib/api/site-diaries';
import { ItemType } from '@/lib/types/form';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createApproval } from '@/lib/api/approvals';
import { getSupabaseClient } from '@/lib/supabase/client';
import { uploadAttachment } from '@/lib/api/attachments';
import { useRouter } from 'next/navigation';
import { useProject } from '@/contexts/ProjectContext';
import SiteDiaryPhotoUploader from '@/components/site-diary-photo-uploader';
import { ApproverSelector } from '@/components/ApproverSelector';
import { SelectedApproversDisplay } from '@/components/SelectedApproversDisplay';

interface CreateSiteDiarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: number | null;
  projectId: number;
  onDiaryCreated: () => void;
  onClose: () => void;
}

// Common metadata fields for site diaries
interface SiteDiaryMetadata {
  weather: string;
  temperature: {
    min?: number;
    max?: number;
  };
  manpower: number;
  equipment: string[];
  materials: string;
  safety: string;
  conditions: string;
}

export function CreateSiteDiarySheet({
  open,
  onOpenChange,
  templateId,
  projectId,
  onDiaryCreated,
  onClose,
}: CreateSiteDiarySheetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { current: currentProject } = useProject();

  // State for form fields
  const [diaryName, setDiaryName] = useState<string>('');
  const [diaryDate, setDiaryDate] = useState<Date>(new Date());
  const [metadata, setMetadata] = useState<SiteDiaryMetadata>({
    weather: 'Sunny',
    temperature: {},
    manpower: 0,
    equipment: [],
    materials: '',
    safety: '',
    conditions: '',
  });

  // State for approvers
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  // State for template and answers
  const [template, setTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [templateItems, setTemplateItems] = useState<SiteDiaryTemplateItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fileUploads, setFileUploads] = useState<Record<number, File[]>>({});

  // Loading states
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A unique ID for this form submission to use with file uploaders
  const [tempEntityId] = useState<string>(`temp-diary-${Date.now()}`);

  // Load template data when templateId changes
  useEffect(() => {
    if (!templateId || !open) return;

    const loadTemplate = async () => {
      setLoading(true);
      setError(null);

      try {
        const templateData = await getSiteDiaryTemplateById(templateId);
        if (templateData) {
          setTemplate(templateData.template);
          setTemplateItems(templateData.items);

          // Set default diary name with template name and date
          setDiaryName(`${templateData.template.name} - ${format(diaryDate, 'MMM d, yyyy')}`);

          // Initialize metadata based on template configuration
          const metadataConfig = templateData.template.metadata || {};
          setMetadata((prev) => ({
            ...prev,
            // Only initialize with default weather if it's enabled
            weather: metadataConfig.enableWeather !== false ? prev.weather : '',
            // If weather options are defined in template, use the first one as default
            ...(metadataConfig.weatherOptions &&
              metadataConfig.weatherOptions.length > 0 && {
                weather: metadataConfig.weatherOptions[0],
              }),
            // Reset equipment to empty array if it's disabled
            equipment: metadataConfig.enableEquipment !== false ? prev.equipment : [],
          }));

          // Initialize answers with empty values
          const initialAnswers: Record<number, any> = {};
          templateData.items.forEach((item) => {
            if (item.id) {
              if (item.item_type === 'checklist') {
                initialAnswers[item.id] = [];
              } else if (item.item_type === 'radio_box') {
                initialAnswers[item.id] = '';
              } else {
                initialAnswers[item.id] = '';
              }
            }
          });
          setAnswers(initialAnswers);
        }
      } catch (err: any) {
        console.error('Error loading template:', err);
        setError(err.message || 'Failed to load template');
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [templateId, open, diaryDate]);

  // Update diary name when date changes
  useEffect(() => {
    if (template) {
      setDiaryName(`${template.name} - ${format(diaryDate, 'MMM d, yyyy')}`);
    }
  }, [diaryDate, template]);

  // Handle approver selection
  const handleApproversChange = (approverIds: string[]) => {
    setSelectedApprovers(approverIds);
  };

  const handleRemoveApprover = (approverId: string) => {
    setSelectedApprovers((prev) => prev.filter((id) => id !== approverId));
  };

  // Handle metadata changes
  const handleMetadataChange = (field: keyof SiteDiaryMetadata, value: any) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle temperature changes
  const handleTemperatureChange = (field: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : Number(value);
    setMetadata((prev) => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        [field]: numValue,
      },
    }));
  };

  // Handle equipment changes
  const handleEquipmentChange = (equipment: string, isChecked: boolean) => {
    setMetadata((prev) => {
      const updatedEquipment = isChecked
        ? [...prev.equipment, equipment]
        : prev.equipment.filter((e) => e !== equipment);

      return {
        ...prev,
        equipment: updatedEquipment,
      };
    });
  };

  // Handle answer changes
  const handleAnswerChange = (itemId: number, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: value,
    }));

    // Clear error for this item if exists
    if (formErrors[`item_${itemId}`]) {
      setFormErrors((prev) => {
        const updated = { ...prev };
        delete updated[`item_${itemId}`];
        return updated;
      });
    }
  };

  const handlePhotoUploadChange = (itemId: number, files: File[] | null) => {
    if (files && files.length > 0) {
      setFileUploads((prev) => ({
        ...prev,
        [itemId]: files,
      }));

      // Also update answers to track that this field has a value
      setAnswers((prev) => ({
        ...prev,
        [itemId]: 'photo_uploaded',
      }));
    } else {
      // Remove the upload if it was cleared
      setFileUploads((prev) => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });

      // Clear the answer
      setAnswers((prev) => ({
        ...prev,
        [itemId]: '',
      }));
    }

    // Clear error for this item if exists
    if (formErrors[`item_${itemId}`]) {
      setFormErrors((prev) => {
        const updated = { ...prev };
        delete updated[`item_${itemId}`];
        return updated;
      });
    }
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!diaryName.trim()) {
      errors.name = 'Diary name is required';
    }

    // Get metadata config or use defaults
    const metadataConfig = template?.metadata || {};

    // Validate required metadata fields
    if (metadataConfig.requireWeather && !metadata.weather) {
      errors.weather = 'Weather is required';
    }

    if (
      metadataConfig.requireTemperature &&
      !metadata.temperature.min &&
      metadata.temperature.min !== 0 &&
      !metadata.temperature.max &&
      metadata.temperature.max !== 0
    ) {
      errors.temperature = 'Temperature is required';
    }

    if (
      metadataConfig.requireManpower &&
      (metadata.manpower === undefined || metadata.manpower === null)
    ) {
      errors.manpower = 'Manpower is required';
    }

    if (metadataConfig.requireEquipment && metadata.equipment.length === 0) {
      errors.equipment = 'Equipment is required';
    }

    if (metadataConfig.requireMaterials && !metadata.materials.trim()) {
      errors.materials = 'Materials are required';
    }

    if (metadataConfig.requireSafety && !metadata.safety.trim()) {
      errors.safety = 'Safety observations are required';
    }

    if (metadataConfig.requireConditions && !metadata.conditions.trim()) {
      errors.conditions = 'Site conditions are required';
    }

    // Validate required template items
    templateItems.forEach((item) => {
      if (item.is_required && item.id) {
        const answer = answers[item.id];
        let isValid = true;

        if (item.item_type === 'checklist') {
          isValid = Array.isArray(answer) && answer.length > 0;
        } else if (item.item_type === 'radio_box') {
          isValid = !!answer;
        } else {
          isValid = !!answer && answer.trim() !== '';
        }

        if (!isValid) {
          errors[`item_${item.id}`] = 'This field is required';
        }
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);

    try {
      if (!user) throw new Error('User not authenticated');
      if (!template) throw new Error('Template not found');

      // Format answers for submission
      const formattedAnswers = Object.entries(answers).map(([key, value]) => ({
        item_id: Number(key),
        value: value,
      }));

      // Create the site diary
      const response = await createSiteDiary({
        name: diaryName,
        date: diaryDate.toISOString(),
        project_id: projectId,
        template_id: template.id || 0,
        submitted_by_user_id: user.id,
        metadata: metadata,
        answers: formattedAnswers,
      });

      // If we have file uploads, handle those separately
      if (Object.keys(fileUploads).length > 0 && response.diary.id) {
        // Upload each file
        for (const [itemId, files] of Object.entries(fileUploads)) {
          for (const file of files) {
            try {
              // Use the standardized uploadAttachment function to create proper attachment records
              const { data: attachment, error: uploadError } = await uploadAttachment({
                projectId: projectId.toString(),
                entityType: 'site_diary',
                entityId: response.diary.id.toString(),
                file: file,
              });

              if (uploadError) {
                console.error('Error uploading file:', uploadError);
                toast.error(`Failed to upload ${file.name}`);
                continue;
              }

              console.log('File uploaded successfully:', file.name);
              console.log('Attachment record created with ID:', attachment?.id);
            } catch (err) {
              console.error('Error in file upload process:', err);
              toast.error(`An error occurred while uploading ${file.name}`);
            }
          }
        }
      }

      // If approvers are selected, create approval requests
      if (selectedApprovers.length > 0 && response.diary.id) {
        try {
          await createApproval({
            entity_type: 'site_diary',
            entity_id: response.diary.id,
            approvers_id: selectedApprovers,
          });
        } catch (err) {
          console.error('Error creating approvals:', err);
          // Don't fail the whole operation if approvals fail
          toast.error('Failed to create approval requests');
        }
      }

      // Success
      toast.success('Site diary created successfully');
      onDiaryCreated();

      // Close the sheet after successful creation
      onOpenChange(false);
      onClose(); // Call onClose to clean up any state
    } catch (err: any) {
      console.error('Error creating site diary:', err);
      setError(err.message || 'Failed to create site diary');
      toast.error('Failed to create site diary');
    } finally {
      setSubmitting(false);
    }
  };

  // Render form item based on its type
  const renderFormItem = (item: SiteDiaryTemplateItem) => {
    if (!item.id) return null;

    const itemId = item.id;
    const error = formErrors[`item_${itemId}`];

    switch (item.item_type) {
      case 'question':
        return (
          <div className="space-y-2">
            <Label
              htmlFor={`item-${itemId}`}
              className={cn(
                item.is_required && "after:ml-0.5 after:text-red-500 after:content-['*']",
              )}
            >
              {item.question_value}
            </Label>
            <Textarea
              id={`item-${itemId}`}
              placeholder="Enter your answer"
              value={answers[itemId] || ''}
              onChange={(e) => handleAnswerChange(itemId, e.target.value)}
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      case 'checklist':
        return (
          <div className="space-y-2">
            <Label
              className={cn(
                item.is_required && "after:ml-0.5 after:text-red-500 after:content-['*']",
              )}
            >
              {item.question_value}
            </Label>
            <div className="space-y-2">
              {item.options?.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`item-${itemId}-option-${index}`}
                    checked={(answers[itemId] || []).includes(option)}
                    onCheckedChange={(checked) => {
                      const currentAnswers = answers[itemId] || [];
                      if (checked) {
                        handleAnswerChange(itemId, [...currentAnswers, option]);
                      } else {
                        handleAnswerChange(
                          itemId,
                          currentAnswers.filter((value: string) => value !== option),
                        );
                      }
                    }}
                  />
                  <Label htmlFor={`item-${itemId}-option-${index}`} className="font-normal">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      case 'radio_box':
        return (
          <div className="space-y-2">
            <Label
              className={cn(
                item.is_required && "after:ml-0.5 after:text-red-500 after:content-['*']",
              )}
            >
              {item.question_value}
            </Label>
            <RadioGroup
              value={answers[itemId] || ''}
              onValueChange={(value) => handleAnswerChange(itemId, value)}
            >
              <div className="space-y-2">
                {item.options?.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`item-${itemId}-option-${index}`} />
                    <Label htmlFor={`item-${itemId}-option-${index}`} className="font-normal">
                      {option}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      case 'photo':
        return (
          <div className="space-y-2">
            <Label
              className={cn(
                item.is_required && "after:ml-0.5 after:text-red-500 after:content-['*']",
              )}
            >
              {item.question_value}
            </Label>
            <SiteDiaryPhotoUploader
              item={item}
              tempEntityId={tempEntityId}
              onUploadChange={handlePhotoUploadChange}
              value={fileUploads[itemId] || null}
              hasError={!!error}
              errorMessage={error || ''}
              isDisabled={submitting}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          // Remove URL parameters when closing
          router.push('/protected/site-diaries');
        }
        onOpenChange(open);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md md:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create Site Diary</SheetTitle>
          <SheetDescription>Fill out the form to create a new site diary.</SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <p>Loading template...</p>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Diary name and date */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="diary-name" className={cn(formErrors.name && 'text-destructive')}>
                  Diary Name<span className="text-destructive">*</span>
                </Label>
                <Input
                  id="diary-name"
                  value={diaryName}
                  onChange={(e) => setDiaryName(e.target.value)}
                  placeholder="Enter diary name"
                  className={formErrors.name ? 'border-destructive' : ''}
                />
                {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="diary-date">
                  Date<span className="text-destructive">*</span>
                </Label>
                <DatePicker date={diaryDate} setDate={(date) => date && setDiaryDate(date)} />
              </div>
            </div>

            {/* Approvers section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Approvers</h3>
                <ApproverSelector
                  selectedApprovers={selectedApprovers}
                  onApproversChange={handleApproversChange}
                  projectId={projectId}
                />
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select team members who need to approve this site diary. If no approvers are
                  selected, the diary will remain in draft status.
                </p>

                <SelectedApproversDisplay
                  selectedApprovers={selectedApprovers}
                  onRemoveApprover={handleRemoveApprover}
                  projectId={projectId}
                  showRemoveButton={true}
                />
              </div>
            </div>

            {/* Metadata section */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Metadata</h3>

              {/* Only show weather if enabled in template */}
              {(!template?.metadata || template.metadata.enableWeather !== false) && (
                <div className="space-y-2">
                  <Label htmlFor="weather" className={cn(formErrors.weather && 'text-destructive')}>
                    Weather
                    {template?.metadata?.requireWeather && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Select
                    value={metadata.weather}
                    onValueChange={(value) => handleMetadataChange('weather', value)}
                  >
                    <SelectTrigger
                      id="weather"
                      className={formErrors.weather ? 'border-destructive' : ''}
                    >
                      <SelectValue placeholder="Select weather condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Use template weather options if available, otherwise use defaults */}
                      {(
                        template?.metadata?.weatherOptions || [
                          'Sunny',
                          'Partly Cloudy',
                          'Cloudy',
                          'Rainy',
                          'Stormy',
                          'Snowy',
                          'Foggy',
                          'Windy',
                        ]
                      ).map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {condition}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.weather && (
                    <p className="text-sm text-destructive">{formErrors.weather}</p>
                  )}
                </div>
              )}

              {/* Only show temperature if enabled in template */}
              {(!template?.metadata || template.metadata.enableTemperature !== false) && (
                <div className="space-y-2">
                  <Label className={cn(formErrors.temperature && 'text-destructive')}>
                    Temperature
                    {template?.metadata?.requireTemperature && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="temperature-min" className="text-sm">
                        Min (°C)
                      </Label>
                      <Input
                        id="temperature-min"
                        type="number"
                        placeholder="Min"
                        value={metadata.temperature.min ?? ''}
                        onChange={(e) => handleTemperatureChange('min', e.target.value)}
                        className={formErrors.temperature ? 'border-destructive' : ''}
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="temperature-max" className="text-sm">
                        Max (°C)
                      </Label>
                      <Input
                        id="temperature-max"
                        type="number"
                        placeholder="Max"
                        value={metadata.temperature.max ?? ''}
                        onChange={(e) => handleTemperatureChange('max', e.target.value)}
                        className={formErrors.temperature ? 'border-destructive' : ''}
                      />
                    </div>
                  </div>
                  {formErrors.temperature && (
                    <p className="text-sm text-destructive">{formErrors.temperature}</p>
                  )}
                </div>
              )}

              {/* Only show manpower if enabled in template */}
              {(!template?.metadata || template.metadata.enableManpower !== false) && (
                <div className="space-y-2">
                  <Label
                    htmlFor="manpower"
                    className={cn(formErrors.manpower && 'text-destructive')}
                  >
                    Manpower
                    {template?.metadata?.requireManpower && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Input
                    id="manpower"
                    type="number"
                    placeholder="Number of workers"
                    value={metadata.manpower || ''}
                    onChange={(e) =>
                      handleMetadataChange('manpower', parseInt(e.target.value) || 0)
                    }
                    className={formErrors.manpower ? 'border-destructive' : ''}
                  />
                  {formErrors.manpower && (
                    <p className="text-sm text-destructive">{formErrors.manpower}</p>
                  )}
                </div>
              )}

              {/* Only show equipment if enabled in template */}
              {(!template?.metadata || template.metadata.enableEquipment !== false) && (
                <div className="space-y-2">
                  <Label className={cn(formErrors.equipment && 'text-destructive')}>
                    Equipment
                    {template?.metadata?.requireEquipment && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Use template equipment options if available, otherwise use defaults */}
                    {(
                      template?.metadata?.equipmentOptions || [
                        'Excavator',
                        'Bulldozer',
                        'Crane',
                        'Loader',
                        'Dump Truck',
                        'Forklift',
                        'Concrete Mixer',
                        'Generator',
                        'Compressor',
                        'Scaffolding',
                      ]
                    ).map((equipment) => (
                      <div key={equipment} className="flex items-center space-x-2">
                        <Checkbox
                          id={`equipment-${equipment}`}
                          checked={metadata.equipment.includes(equipment)}
                          onCheckedChange={(checked) => handleEquipmentChange(equipment, !!checked)}
                        />
                        <Label
                          htmlFor={`equipment-${equipment}`}
                          className="cursor-pointer text-sm"
                        >
                          {equipment}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {formErrors.equipment && (
                    <p className="text-sm text-destructive">{formErrors.equipment}</p>
                  )}
                </div>
              )}

              {/* Only show materials if enabled in template */}
              {(!template?.metadata || template.metadata.enableMaterials !== false) && (
                <div className="space-y-2">
                  <Label
                    htmlFor="materials"
                    className={cn(formErrors.materials && 'text-destructive')}
                  >
                    Materials
                    {template?.metadata?.requireMaterials && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Textarea
                    id="materials"
                    placeholder="List materials used"
                    value={metadata.materials || ''}
                    onChange={(e) => handleMetadataChange('materials', e.target.value)}
                    className={formErrors.materials ? 'border-destructive' : ''}
                  />
                  {formErrors.materials && (
                    <p className="text-sm text-destructive">{formErrors.materials}</p>
                  )}
                </div>
              )}

              {/* Only show safety if enabled in template */}
              {(!template?.metadata || template.metadata.enableSafety !== false) && (
                <div className="space-y-2">
                  <Label htmlFor="safety" className={cn(formErrors.safety && 'text-destructive')}>
                    Safety Observations
                    {template?.metadata?.requireSafety && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Textarea
                    id="safety"
                    placeholder="Note any safety observations or incidents"
                    value={metadata.safety || ''}
                    onChange={(e) => handleMetadataChange('safety', e.target.value)}
                    className={formErrors.safety ? 'border-destructive' : ''}
                  />
                  {formErrors.safety && (
                    <p className="text-sm text-destructive">{formErrors.safety}</p>
                  )}
                </div>
              )}

              {/* Only show site conditions if enabled in template */}
              {(!template?.metadata || template.metadata.enableConditions !== false) && (
                <div className="space-y-2">
                  <Label
                    htmlFor="conditions"
                    className={cn(formErrors.conditions && 'text-destructive')}
                  >
                    Site Conditions
                    {template?.metadata?.requireConditions && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Textarea
                    id="conditions"
                    placeholder="Describe current site conditions"
                    value={metadata.conditions || ''}
                    onChange={(e) => handleMetadataChange('conditions', e.target.value)}
                    className={formErrors.conditions ? 'border-destructive' : ''}
                  />
                  {formErrors.conditions && (
                    <p className="text-sm text-destructive">{formErrors.conditions}</p>
                  )}
                </div>
              )}
            </div>

            {/* Template questions */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Questions</h3>

              {templateItems.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No questions in this template
                </p>
              ) : (
                <div className="space-y-6">
                  {templateItems.map((item) => (
                    <div key={item.id} className="space-y-2">
                      {renderFormItem(item)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  router.push('/protected/site-diaries');
                  onClose();
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Site Diary'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
