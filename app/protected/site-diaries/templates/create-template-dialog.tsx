'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/contexts/ProjectContext';
import {
  SiteDiaryTemplate,
  SiteDiaryTemplateItem,
  SiteDiaryMetadataConfig,
} from '@/lib/types/site-diary';
import {
  getSiteDiaryTemplateById,
  createSiteDiaryTemplate,
  updateSiteDiaryTemplate,
} from '@/lib/api/site-diaries';
import { X, GripVertical, Plus, Image as ImageIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: number | null;
  projectId: number;
  onTemplateChange: (template: SiteDiaryTemplate) => void;
}

// Question type options
const questionTypes = [
  { value: 'question', label: 'Short answer' },
  { value: 'radio_box', label: 'Multiple choice' },
  { value: 'checklist', label: 'Checkboxes' },
  { value: 'photo', label: 'Photo' },
] as const;

// Default options
const DEFAULT_WEATHER_OPTIONS = [
  'Sunny',
  'Partly Cloudy',
  'Cloudy',
  'Rainy',
  'Stormy',
  'Snowy',
  'Foggy',
  'Windy',
];

const DEFAULT_EQUIPMENT_OPTIONS = [
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
];

// Default metadata configuration with all fields disabled
const DEFAULT_METADATA_CONFIG: SiteDiaryMetadataConfig = {
  enableWeather: false,
  enableTemperature: false,
  enableManpower: false,
  enableEquipment: false,
  enableMaterials: false,
  enableSafety: false,
  enableConditions: false,
  weatherOptions: [...DEFAULT_WEATHER_OPTIONS],
  equipmentOptions: [...DEFAULT_EQUIPMENT_OPTIONS],
  requireWeather: false,
  requireTemperature: false,
  requireManpower: false,
  requireEquipment: false,
  requireMaterials: false,
  requireSafety: false,
  requireConditions: false,
};

// Sortable question card component
interface SortableQuestionCardProps {
  id: string;
  question: SiteDiaryTemplateItem;
  onUpdate: (id: string, updates: Partial<SiteDiaryTemplateItem>) => void;
  onDelete: (id: string) => void;
}

function SortableQuestionCard({ id, question, onUpdate, onDelete }: SortableQuestionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms ease',
        zIndex: isDragging ? 10 : 1,
        position: 'relative' as const,
        opacity: isDragging ? 0.8 : 1,
      }
    : undefined;

  const [showOptions, setShowOptions] = useState<boolean>(
    question.item_type === 'radio_box' || question.item_type === 'checklist',
  );
  const [optionInput, setOptionInput] = useState<string>('');

  // Effect to show/hide options based on question type
  useEffect(() => {
    setShowOptions(question.item_type === 'radio_box' || question.item_type === 'checklist');
  }, [question.item_type]);

  // Handle adding an option
  const handleAddOption = () => {
    if (!optionInput.trim()) return;

    const updatedOptions = [...(question.options || []), optionInput.trim()];
    onUpdate(id, { options: updatedOptions });
    setOptionInput('');
  };

  // Handle removing an option
  const handleRemoveOption = (indexToRemove: number) => {
    const updatedOptions = (question.options || []).filter((_, index) => index !== indexToRemove);
    onUpdate(id, { options: updatedOptions });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('mb-4 rounded-md border bg-card p-4', isDragging ? 'shadow-lg' : '')}
    >
      <div className="mb-4 flex items-center gap-4">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 hover:bg-muted"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        <Select
          value={question.item_type}
          onValueChange={(value) => onUpdate(id, { item_type: value as any })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Question type" />
          </SelectTrigger>
          <SelectContent>
            {questionTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(id)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`question-${id}`}>Question</Label>
          <Textarea
            id={`question-${id}`}
            placeholder="Enter your question"
            value={question.question_value || ''}
            onChange={(e) => onUpdate(id, { question_value: e.target.value })}
            className="resize-none"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id={`required-${id}`}
            checked={question.is_required}
            onCheckedChange={(checked) => onUpdate(id, { is_required: !!checked })}
          />
          <Label htmlFor={`required-${id}`} className="font-normal">
            Required
          </Label>
        </div>

        {showOptions && (
          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-2">
              {(question.options || []).map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(e) => {
                      const updatedOptions = [...(question.options || [])];
                      updatedOptions[index] = e.target.value;
                      onUpdate(id, { options: updatedOptions });
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveOption(index)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add an option"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddOption}
                  disabled={!optionInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {question.item_type === 'photo' && (
          <div className="space-y-2">
            <Label>Photo Upload Preview</Label>
            <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted p-6 text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Photo Upload Field</p>
              <p className="text-xs text-muted-foreground">
                Users will be able to upload photos here
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: This is just a preview. Actual photos will be uploaded when the site diary is
              created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  templateId,
  projectId,
  onTemplateChange,
}: CreateTemplateDialogProps) {
  const { user } = useAuth();
  const { current: currentProject } = useProject();

  // Log project information for debugging
  useEffect(() => {
    if (open) {
      console.log('CreateTemplateDialog opened with projectId:', projectId);
      console.log('Current project from context:', currentProject);
    }
  }, [open, projectId, currentProject]);

  // State for form fields
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [questions, setQuestions] = useState<SiteDiaryTemplateItem[]>([]);

  // Metadata configuration state
  const [metadataConfig, setMetadataConfig] = useState<SiteDiaryMetadataConfig>({
    ...DEFAULT_METADATA_CONFIG,
  });

  // State for custom options
  const [customWeatherOption, setCustomWeatherOption] = useState('');
  const [customEquipmentOption, setCustomEquipmentOption] = useState('');

  // Loading states
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form validation
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    questions?: string;
  }>({});

  // Unsaved changes state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedChangesAlert, setShowUnsavedChangesAlert] = useState(false);

  // Keep original data for comparison
  const initialDataRef = useRef({
    name: '',
    description: '',
    questions: [] as SiteDiaryTemplateItem[],
    metadata: {} as SiteDiaryMetadataConfig,
  });

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Start dragging after moving 5px
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Track changes to detect unsaved content
  useEffect(() => {
    if (loading || submitting) return;

    // Don't mark as changed during initial load
    if (!initialDataRef.current.name && templateName) {
      initialDataRef.current = {
        name: templateName,
        description: templateDescription,
        questions: [...questions],
        metadata: { ...metadataConfig },
      };
      return;
    }

    // Compare primitive values directly
    const hasNameChanged = initialDataRef.current.name !== templateName;
    const hasDescriptionChanged = initialDataRef.current.description !== templateDescription;

    // Perform deep comparison for questions array
    let hasQuestionsChanged = initialDataRef.current.questions.length !== questions.length;

    if (!hasQuestionsChanged) {
      // Only do detailed comparison if lengths match
      for (let i = 0; i < questions.length; i++) {
        const origQuestion = initialDataRef.current.questions[i];
        const currQuestion = questions[i];

        // Compare important fields individually
        if (
          origQuestion.question_value !== currQuestion.question_value ||
          origQuestion.item_type !== currQuestion.item_type ||
          origQuestion.is_required !== currQuestion.is_required ||
          // Compare arrays
          JSON.stringify(origQuestion.options?.sort()) !==
            JSON.stringify(currQuestion.options?.sort())
        ) {
          hasQuestionsChanged = true;
          break;
        }
      }
    }

    // Perform deep comparison for metadata
    const initialMeta = initialDataRef.current.metadata;
    const currentMeta = metadataConfig;

    const hasMetadataChanged =
      initialMeta.enableWeather !== currentMeta.enableWeather ||
      initialMeta.enableTemperature !== currentMeta.enableTemperature ||
      initialMeta.enableManpower !== currentMeta.enableManpower ||
      initialMeta.enableEquipment !== currentMeta.enableEquipment ||
      initialMeta.enableMaterials !== currentMeta.enableMaterials ||
      initialMeta.enableSafety !== currentMeta.enableSafety ||
      initialMeta.enableConditions !== currentMeta.enableConditions ||
      initialMeta.requireWeather !== currentMeta.requireWeather ||
      initialMeta.requireTemperature !== currentMeta.requireTemperature ||
      initialMeta.requireManpower !== currentMeta.requireManpower ||
      initialMeta.requireEquipment !== currentMeta.requireEquipment ||
      initialMeta.requireMaterials !== currentMeta.requireMaterials ||
      initialMeta.requireSafety !== currentMeta.requireSafety ||
      initialMeta.requireConditions !== currentMeta.requireConditions ||
      // Compare arrays with sorting to handle order differences
      JSON.stringify(initialMeta.weatherOptions?.sort()) !==
        JSON.stringify(currentMeta.weatherOptions?.sort()) ||
      JSON.stringify(initialMeta.equipmentOptions?.sort()) !==
        JSON.stringify(currentMeta.equipmentOptions?.sort());

    setHasUnsavedChanges(
      hasNameChanged || hasDescriptionChanged || hasQuestionsChanged || hasMetadataChanged,
    );
  }, [templateName, templateDescription, questions, loading, submitting, metadataConfig]);

  // Reset form when dialog is closed
  useEffect(() => {
    if (!open) {
      // Only reset if not editing an existing template
      if (!templateId) {
        resetForm();
      }
    } else {
      // When opening a new template
      if (!templateId) {
        setTemplateName('');
        setTemplateDescription('');
        setQuestions([]);
        // Force setting metadata config with all fields disabled
        setMetadataConfig({ ...DEFAULT_METADATA_CONFIG });
        initialDataRef.current = {
          name: '',
          description: '',
          questions: [],
          metadata: { ...DEFAULT_METADATA_CONFIG },
        };
        setHasUnsavedChanges(false);
      }
    }
  }, [open, templateId]);

  // Load template data when templateId changes
  useEffect(() => {
    if (!templateId || !open) return;

    const loadTemplate = async () => {
      setLoading(true);
      setError(null);

      try {
        const templateData = await getSiteDiaryTemplateById(templateId);
        if (templateData) {
          setTemplateName(templateData.template.name);
          setTemplateDescription(templateData.template.description || '');
          setQuestions(templateData.items);

          // Load metadata configuration if it exists
          if (templateData.template.metadata) {
            const config = templateData.template.metadata as SiteDiaryMetadataConfig;

            // Apply defaults for any missing values
            const fullConfig = {
              enableWeather: config.enableWeather ?? false,
              enableTemperature: config.enableTemperature ?? false,
              enableManpower: config.enableManpower ?? false,
              enableEquipment: config.enableEquipment ?? false,
              enableMaterials: config.enableMaterials ?? false,
              enableSafety: config.enableSafety ?? false,
              enableConditions: config.enableConditions ?? false,
              weatherOptions: config.weatherOptions || [...DEFAULT_WEATHER_OPTIONS],
              equipmentOptions: config.equipmentOptions || [...DEFAULT_EQUIPMENT_OPTIONS],
              requireWeather: config.requireWeather ?? false,
              requireTemperature: config.requireTemperature ?? false,
              requireManpower: config.requireManpower ?? false,
              requireEquipment: config.requireEquipment ?? false,
              requireMaterials: config.requireMaterials ?? false,
              requireSafety: config.requireSafety ?? false,
              requireConditions: config.requireConditions ?? false,
            };

            setMetadataConfig(fullConfig);
          } else {
            // If no metadata exists, use defaults
            setMetadataConfig({ ...DEFAULT_METADATA_CONFIG });
          }

          // Store initial data for change detection
          initialDataRef.current = {
            name: templateData.template.name,
            description: templateData.template.description || '',
            questions: templateData.items.map((item) => ({
              ...item,
              options: item.options ? [...item.options] : [],
            })),
            metadata: templateData.template.metadata
              ? {
                  ...(templateData.template.metadata as SiteDiaryMetadataConfig),
                  weatherOptions: [
                    ...((templateData.template.metadata as SiteDiaryMetadataConfig)
                      .weatherOptions || []),
                  ],
                  equipmentOptions: [
                    ...((templateData.template.metadata as SiteDiaryMetadataConfig)
                      .equipmentOptions || []),
                  ],
                }
              : { ...DEFAULT_METADATA_CONFIG },
          };
          setHasUnsavedChanges(false);
        }
      } catch (err: any) {
        console.error('Error loading template:', err);
        setError(err.message || 'Failed to load template');
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [templateId, open]);

  // Reset form to initial state
  const resetForm = () => {
    setTemplateName('');
    setTemplateDescription('');
    setQuestions([]);
    setFormErrors({});
    setError(null);
    setHasUnsavedChanges(false);
    setMetadataConfig({ ...DEFAULT_METADATA_CONFIG });
    initialDataRef.current = {
      name: '',
      description: '',
      questions: [],
      metadata: { ...DEFAULT_METADATA_CONFIG },
    };
  };

  // Handle dialog close attempt
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedChangesAlert(true);
    } else {
      onOpenChange(false);
    }
  };

  // Handle confirmed close
  const handleConfirmedClose = () => {
    setShowUnsavedChangesAlert(false);
    onOpenChange(false);
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    const errors: { name?: string; questions?: string } = {};

    if (!templateName.trim()) {
      errors.name = 'Template name is required';
    }

    if (questions.length === 0) {
      errors.questions = 'At least one question is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Add a new question
  const addQuestion = () => {
    const newQuestion: SiteDiaryTemplateItem = {
      item_type: 'question',
      question_value: '',
      options: [],
      is_required: false,
      display_order: questions.length,
    };

    setQuestions([...questions, newQuestion]);

    // Clear questions error if it exists
    if (formErrors.questions) {
      setFormErrors({ ...formErrors, questions: undefined });
    }
  };

  // Update a question
  const updateQuestion = (id: string, updates: Partial<SiteDiaryTemplateItem>) => {
    setQuestions((prevQuestions) =>
      prevQuestions.map((question, index) =>
        index.toString() === id ? { ...question, ...updates } : question,
      ),
    );
  };

  // Delete a question
  const deleteQuestion = (id: string) => {
    setQuestions((prevQuestions) => prevQuestions.filter((_, index) => index.toString() !== id));
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id.toString());
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = parseInt(active.id.toString());
        const newIndex = parseInt(over.id.toString());

        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          display_order: index,
        }));
      });
    }
  };

  // Handle adding custom weather option
  const handleAddWeatherOption = () => {
    if (!customWeatherOption.trim()) return;

    setMetadataConfig((prev) => ({
      ...prev,
      weatherOptions: [...(prev.weatherOptions || []), customWeatherOption.trim()],
    }));
    setCustomWeatherOption('');
  };

  // Handle removing weather option
  const handleRemoveWeatherOption = (optionToRemove: string) => {
    setMetadataConfig((prev) => ({
      ...prev,
      weatherOptions: (prev.weatherOptions || []).filter((option) => option !== optionToRemove),
    }));
  };

  // Handle adding custom equipment option
  const handleAddEquipmentOption = () => {
    if (!customEquipmentOption.trim()) return;

    setMetadataConfig((prev) => ({
      ...prev,
      equipmentOptions: [...(prev.equipmentOptions || []), customEquipmentOption.trim()],
    }));
    setCustomEquipmentOption('');
  };

  // Handle removing equipment option
  const handleRemoveEquipmentOption = (optionToRemove: string) => {
    setMetadataConfig((prev) => ({
      ...prev,
      equipmentOptions: (prev.equipmentOptions || []).filter((option) => option !== optionToRemove),
    }));
  };

  // Toggle metadata field function
  const toggleMetadataField = (field: keyof SiteDiaryMetadataConfig, value: boolean) => {
    setMetadataConfig((prev) => {
      const newConfig = {
        ...prev,
        [field]: value,
      };
      return newConfig;
    });
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!user) return;

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    setSubmitting(true);

    try {
      if (templateId) {
        // Update existing template
        const response = await updateSiteDiaryTemplate(templateId, {
          name: templateName,
          description: templateDescription,
          metadata: metadataConfig,
          items: questions.map((q, index) => ({
            ...q,
            display_order: index,
          })),
        });

        toast.success('Template updated successfully');
        onTemplateChange(response.template);
      } else {
        // Create new template - use current project ID from context if available
        const effectiveProjectId = currentProject?.id || projectId;
        console.log('Creating template with project ID:', effectiveProjectId);

        const response = await createSiteDiaryTemplate({
          name: templateName,
          description: templateDescription,
          project_id: effectiveProjectId,
          created_by: user.id,
          metadata: metadataConfig,
          items: questions.map((q, index) => ({
            ...q,
            display_order: index,
          })),
        });

        toast.success('Template created successfully');
        onTemplateChange(response.template);
      }

      // Close the dialog after successful submission
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving template:', err);
      toast.error(err.message || 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AlertDialog open={showUnsavedChangesAlert} onOpenChange={setShowUnsavedChangesAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost if you close this dialog. Are you sure you
              want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedClose}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={handleCloseAttempt}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templateId ? 'Edit Template' : 'Create Site Diary Template'}</DialogTitle>
          </DialogHeader>

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
            <Tabs defaultValue="general" className="space-y-4">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="metadata">Metadata Fields</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="template-name"
                      className={cn('font-medium', formErrors.name && 'text-destructive')}
                    >
                      Template Name<span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="template-name"
                      placeholder="Enter template name"
                      value={templateName}
                      onChange={(e) => {
                        setTemplateName(e.target.value);
                        if (formErrors.name) {
                          setFormErrors({ ...formErrors, name: undefined });
                        }
                      }}
                      className={formErrors.name ? 'border-destructive' : ''}
                    />
                    {formErrors.name && (
                      <p className="text-sm text-destructive">{formErrors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-description" className="font-medium">
                      Description
                    </Label>
                    <Textarea
                      id="template-description"
                      placeholder="Enter template description"
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label
                      className={cn(
                        'text-lg font-medium',
                        formErrors.questions && 'text-destructive',
                      )}
                    >
                      Questions
                    </Label>
                  </div>

                  {formErrors.questions && (
                    <p className="text-sm text-destructive">{formErrors.questions}</p>
                  )}

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={questions.map((_, index) => index.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      {questions.length === 0 ? (
                        <div className="rounded-md border py-8 text-center">
                          <p className="mb-4 text-muted-foreground">No questions added</p>
                          <Button variant="outline" onClick={addQuestion}>
                            <Plus className="mr-2 h-4 w-4" /> Add Question
                          </Button>
                        </div>
                      ) : (
                        questions.map((question, index) => (
                          <SortableQuestionCard
                            key={index}
                            id={index.toString()}
                            question={question}
                            onUpdate={updateQuestion}
                            onDelete={deleteQuestion}
                          />
                        ))
                      )}
                    </SortableContext>
                  </DndContext>

                  {questions.length > 0 && (
                    <Button variant="outline" className="w-full" onClick={addQuestion}>
                      <Plus className="mr-2 h-4 w-4" /> Add Question
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="metadata" className="space-y-6">
                <div className="mb-4 rounded-md bg-muted/50 p-4">
                  <h3 className="mb-2 text-sm font-medium">Metadata Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure which metadata fields should be available in site diaries created with
                    this template. Enable or disable sections and specify whether they are required.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Weather Section */}
                  <div className="space-y-4 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-weather"
                          checked={metadataConfig.enableWeather}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableWeather', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-weather" className="font-medium">
                          Weather
                        </Label>
                      </div>

                      {metadataConfig.enableWeather && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-weather"
                            checked={metadataConfig.requireWeather}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireWeather', !!checked)
                            }
                          />
                          <Label htmlFor="require-weather" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>

                    {metadataConfig.enableWeather && (
                      <div className="space-y-3 pt-2">
                        <Label className="text-sm">Weather Options</Label>
                        <div className="flex flex-wrap gap-2">
                          {(metadataConfig.weatherOptions || []).map((option) => (
                            <div
                              key={option}
                              className="flex items-center rounded-md bg-muted px-2 py-1"
                            >
                              <span className="mr-1 text-sm">{option}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => handleRemoveWeatherOption(option)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="flex space-x-2">
                          <Input
                            placeholder="Add weather option"
                            value={customWeatherOption}
                            onChange={(e) => setCustomWeatherOption(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddWeatherOption}
                            disabled={!customWeatherOption.trim()}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Temperature Section */}
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-temperature"
                          checked={metadataConfig.enableTemperature}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableTemperature', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-temperature" className="font-medium">
                          Temperature
                        </Label>
                      </div>

                      {metadataConfig.enableTemperature && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-temperature"
                            checked={metadataConfig.requireTemperature}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireTemperature', !!checked)
                            }
                          />
                          <Label htmlFor="require-temperature" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manpower Section */}
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-manpower"
                          checked={metadataConfig.enableManpower}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableManpower', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-manpower" className="font-medium">
                          Manpower
                        </Label>
                      </div>

                      {metadataConfig.enableManpower && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-manpower"
                            checked={metadataConfig.requireManpower}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireManpower', !!checked)
                            }
                          />
                          <Label htmlFor="require-manpower" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Equipment Section */}
                  <div className="space-y-4 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-equipment"
                          checked={metadataConfig.enableEquipment}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableEquipment', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-equipment" className="font-medium">
                          Equipment
                        </Label>
                      </div>

                      {metadataConfig.enableEquipment && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-equipment"
                            checked={metadataConfig.requireEquipment}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireEquipment', !!checked)
                            }
                          />
                          <Label htmlFor="require-equipment" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>

                    {metadataConfig.enableEquipment && (
                      <div className="space-y-3 pt-2">
                        <Label className="text-sm">Equipment Options</Label>
                        <div className="flex flex-wrap gap-2">
                          {(metadataConfig.equipmentOptions || []).map((option) => (
                            <div
                              key={option}
                              className="flex items-center rounded-md bg-muted px-2 py-1"
                            >
                              <span className="mr-1 text-sm">{option}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => handleRemoveEquipmentOption(option)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="flex space-x-2">
                          <Input
                            placeholder="Add equipment option"
                            value={customEquipmentOption}
                            onChange={(e) => setCustomEquipmentOption(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddEquipmentOption}
                            disabled={!customEquipmentOption.trim()}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Materials Section */}
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-materials"
                          checked={metadataConfig.enableMaterials}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableMaterials', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-materials" className="font-medium">
                          Materials
                        </Label>
                      </div>

                      {metadataConfig.enableMaterials && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-materials"
                            checked={metadataConfig.requireMaterials}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireMaterials', !!checked)
                            }
                          />
                          <Label htmlFor="require-materials" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Safety Section */}
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-safety"
                          checked={metadataConfig.enableSafety}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableSafety', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-safety" className="font-medium">
                          Safety Observations
                        </Label>
                      </div>

                      {metadataConfig.enableSafety && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-safety"
                            checked={metadataConfig.requireSafety}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireSafety', !!checked)
                            }
                          />
                          <Label htmlFor="require-safety" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Site Conditions Section */}
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-conditions"
                          checked={metadataConfig.enableConditions}
                          onCheckedChange={(checked) => {
                            toggleMetadataField('enableConditions', !!checked);
                          }}
                        />
                        <Label htmlFor="enable-conditions" className="font-medium">
                          Site Conditions
                        </Label>
                      </div>

                      {metadataConfig.enableConditions && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="require-conditions"
                            checked={metadataConfig.requireConditions}
                            onCheckedChange={(checked) =>
                              toggleMetadataField('requireConditions', !!checked)
                            }
                          />
                          <Label htmlFor="require-conditions" className="text-sm">
                            Required
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? templateId
                  ? 'Updating...'
                  : 'Creating...'
                : templateId
                  ? 'Update Template'
                  : 'Create Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
