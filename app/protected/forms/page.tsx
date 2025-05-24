"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X, ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { getForms, getFormById, updateForm } from "@/lib/api/forms";
import { FormResponse, FormItem, ItemType, Form } from "@/lib/types/form";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import TextareaAutosize from 'react-textarea-autosize';
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableQuestionCard } from '@/components/forms/sortable-question-card';
import { FormBuilderQuestion } from '@/lib/types/form-builder';
import { AssigneeSelector } from '@/components/AssigneeSelector';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseClient } from '@/lib/supabase/client';
import { createFormEntry } from "@/lib/api/form-entries";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const questionTypes = [
  { value: "question", label: "Short answer" },
  { value: "radio_box", label: "Multiple choice" },
  { value: "checklist", label: "Checkboxes" },
  { value: "photo", label: "Photo" },
] as const;

// Adapter functions to convert between FormItem and FormBuilderQuestion
const toFormBuilderQuestion = (item: FormItem): FormBuilderQuestion => ({
  id: item.id?.toString() || item.display_order.toString(),
  type: item.item_type,
  title: item.question_value,
  options: item.options,
  required: item.is_required,
});

const fromFormBuilderQuestion = (question: FormBuilderQuestion, displayOrder: number): Omit<FormItem, 'id' | 'form_id'> => ({
  item_type: question.type,
  question_value: question.title,
  options: question.options,
  is_required: question.required,
  display_order: displayOrder,
});

// SearchParamsWrapper component to handle the useSearchParams hook
function SearchParamsWrapper() {
  const searchParams = useSearchParams();
  const formId = searchParams.get('formId');
  const entryMode = searchParams.get('entryMode');
  
  return (
    <FormsPageContent formId={formId} entryMode={entryMode} />
  );
}

// Main component content without direct useSearchParams usage
function FormsPageContent({ formId, entryMode }: { formId: string | null; entryMode: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // State for form detail view
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [formDetail, setFormDetail] = useState<FormResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // State for edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedItems, setEditedItems] = useState<FormItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // State for assignees
  const [assignees, setAssignees] = useState<{ id: string; name: string; avatar_url?: string }[]>([]);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  // New state for entry creation
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [entryName, setEntryName] = useState<string>("");
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [formErrors, setFormErrors] = useState<Record<number, string>>({});
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [assignedBy, setAssignedBy] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Format current date for the entry name placeholder
  const currentDate = new Intl.DateTimeFormat('en-US', {
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  // Effect to handle initial formId from URL
  useEffect(() => {
    if (formId) {
      const id = parseInt(formId);
      if (!isNaN(id)) {
        setSelectedFormId(id);
        
        // Set entry creation mode if requested
        if (entryMode === 'new') {
          setIsCreatingEntry(true);
        }
      }
    }
  }, [formId, entryMode]);

  // Effect to fetch forms initially
  useEffect(() => {
    const loadForms = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedForms = await getForms();
        setForms(fetchedForms);
      } catch (err: any) {
        console.error("Error loading forms:", err);
        setError(err.message || "Failed to load forms");
        setForms([]);
      } finally {
        setLoading(false);
      }
    };

    loadForms();
  }, []);

  // Effect to load form details when a form is selected
  useEffect(() => {
    if (selectedFormId === null) {
      setFormDetail(null);
      setEditedTitle("");
      setEditedItems([]);
      setIsEditing(false);
      setIsCreatingEntry(false);
      return;
    }

    const fetchFormAndAssignees = async () => {
      setLoadingDetail(true);
      try {
        const data = await getFormById(selectedFormId);
        setFormDetail(data);
        setEditedTitle(data?.form.name || "");
        setEditedItems(data?.items || []);

        // Set default entry name with form name and date when form is loaded
        if (data?.form) {
          setEntryName(`${data.form.name} - ${currentDate}`);
        }

        // Determine who assigned the form
        if (data?.form.owner_id === user?.id) {
          setAssignedBy("Me");
        } else if (data?.form.assignees && data.form.assignees.length > 0) {
          // Use the first assignee's name if available
          const assignee = data.form.assignees[0];
          setAssignedBy(assignee.raw_user_meta_data.name || "Unknown");
        } else if (data?.form.owner_id) {
          // Fetch owner details from Supabase
          const supabase = getSupabaseClient();
          const { data: userData, error } = await supabase.rpc('get_user_details', {
            user_ids: [data.form.owner_id]
          });
          
          if (error) {
            console.error('Error fetching owner details:', error);
            setAssignedBy("Unknown");
          } else if (userData && userData.length > 0) {
            const ownerData = userData[0].raw_user_meta_data as { name?: string };
            setAssignedBy(ownerData.name || "Unknown User");
          } else {
            setAssignedBy("Unknown");
          }
        }

        // Fetch assignees from entity_assignees
        const supabase = getSupabaseClient();
        const { data: assigneeData, error: assigneeError } = await supabase
          .from('entity_assignees')
          .select('user_id')
          .eq('entity_type', 'form')
          .eq('entity_id', selectedFormId);

        if (assigneeError) {
          console.error('Error fetching assignees:', assigneeError);
          return;
        }

        if (assigneeData && assigneeData.length > 0) {
          // Get user details using the helper function
          const { data: userData, error: userError } = await supabase
            .rpc('get_user_details', {
              user_ids: assigneeData.map(a => a.user_id)
            });

          if (userError) {
            console.error('Error fetching users:', userError);
            return;
          }

          if (userData) {
            setAssignees(userData.map(user => {
              const metadata = user.raw_user_meta_data as { name?: string; avatar_url?: string };
              return {
                id: user.id,
                name: metadata?.name || '',
                avatar_url: metadata?.avatar_url
              };
            }));
          }
        } else {
          setAssignees([]);
        }
      } catch (error) {
        console.error("Error fetching form:", error);
        toast.error("Failed to load form");
      } finally {
        setLoadingDetail(false);
      }
    };

    fetchFormAndAssignees();
  }, [selectedFormId, user?.id, currentDate]);

  const filteredForms = forms.filter(
    (form) => form.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleViewForm = (formId: number | undefined) => {
    if (formId === undefined) return;
    router.push(`/protected/forms?formId=${formId}`);
    setSelectedFormId(formId);
    setIsClosing(false);
  };

  const handleCreateEntry = (formId: number | undefined) => {
    if (formId === undefined) return;
    setIsCreatingEntry(true);
    setAnswers({});
    setFormErrors({});
    // Update URL to reflect entry creation mode
    router.push(`/protected/forms?formId=${formId}&entryMode=new`);
  };

  const handleCloseDetail = () => {
    setIsClosing(true);
    setTimeout(() => {
      router.push('/protected/forms');
      setSelectedFormId(null);
      setIsCreatingEntry(false);
    }, 300);
  };

  const handleCloseEntryForm = () => {
    setIsCreatingEntry(false);
    // Update URL to remove entry mode parameter but keep the form ID
    if (selectedFormId) {
      router.push(`/protected/forms?formId=${selectedFormId}`);
    }
  };

  const handleSheetOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (isEditing && hasChanges()) {
        if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
          handleCloseDetail();
        }
      } else {
        handleCloseDetail();
      }
    }
  };

  const hasChanges = () => {
    if (!formDetail) return false;
    
    // Check if title has changed
    if (editedTitle.trim() !== formDetail.form.name) return true;
    
    // Check if number of items has changed
    if (editedItems.length !== formDetail.items.length) return true;
    
    // Check if any items have changed
    return editedItems.some((editedItem, index) => {
      const originalItem = formDetail.items[index];
      if (!originalItem) return true;
      
      return (
        editedItem.question_value !== originalItem.question_value ||
        editedItem.item_type !== originalItem.item_type ||
        editedItem.is_required !== originalItem.is_required ||
        editedItem.display_order !== originalItem.display_order ||
        // Compare options arrays
        JSON.stringify(editedItem.options) !== JSON.stringify(originalItem.options)
      );
    });
  };

  const handleSave = async () => {
    if (!formDetail || selectedFormId === null) return;
    
    // Check if there are any changes
    if (!hasChanges()) {
      setIsEditing(false);
      toast.info("No changes to save");
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Prepare items by excluding id and form_id
      const itemsToUpdate = editedItems.map(({ id, form_id, ...item }) => ({
        ...item,
        display_order: item.display_order || 0, // Ensure display_order is set
      }));
      
      await updateForm(selectedFormId, {
        name: editedTitle.trim(),
        items: itemsToUpdate,
      });
      
      // Update local state
      setFormDetail({
        ...formDetail,
        form: {
          ...formDetail.form,
          name: editedTitle.trim(),
        },
        items: editedItems,
      });
      
      setIsEditing(false);
      toast.success("Form updated successfully");
    } catch (error) {
      console.error("Error updating form:", error);
      toast.error("Failed to update form");
    } finally {
      setIsSaving(false);
    }
  };

  const updateQuestion = (id: string, updates: Partial<FormBuilderQuestion>) => {
    const index = editedItems.findIndex(item => 
      item.id?.toString() === id || item.display_order.toString() === id
    );
    
    if (index === -1) return;

    setEditedItems(items => 
      items.map((item, i) => 
        i === index 
          ? { 
              ...item, 
              item_type: updates.type || item.item_type,
              question_value: updates.title || item.question_value,
              options: updates.options || item.options,
              is_required: updates.required ?? item.is_required,
            } 
          : item
      )
    );
  };

  const deleteQuestion = (id: string) => {
    const index = editedItems.findIndex(item => 
      item.id?.toString() === id || item.display_order.toString() === id
    );
    if (index === -1) return;
    setEditedItems(items => items.filter((_, i) => i !== index));
  };

  const getStatusColor = () => {
    if (!formDetail) return 'bg-muted text-muted-foreground';
    if (formDetail.form.is_synced) {
      return 'bg-green-500/10 text-green-700 dark:text-green-400';
    } else if (assignees.length > 0) {
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    } else {
      return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = () => {
    if (!formDetail) return 'Loading...';
    if (formDetail.form.is_synced) {
      return 'Completed';
    } else if (assignees.length > 0) {
      return 'In Progress';
    } else {
      return 'Draft';
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setEditedItems((items) => {
        const oldIndex = items.findIndex((item) => 
          (item.id?.toString() || item.display_order.toString()) === active.id
        );
        const newIndex = items.findIndex((item) => 
          (item.id?.toString() || item.display_order.toString()) === over.id
        );
        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          display_order: index,
        }));
      });
    }
  };

  const addQuestion = () => {
    const newQuestion: FormItem = {
      item_type: "question",
      question_value: "",
      options: [],
      is_required: false,
      display_order: editedItems.length,
    };
    setEditedItems([...editedItems, newQuestion]);
  };

  const handleAssigneeAdd = async (member: any) => {
    if (!user?.id || selectedFormId === null) return;
    setAssigneeError(null);
    
    try {
      const supabase = getSupabaseClient();

      // Check if already assigned
      if (assignees.some(a => a.id === member.id)) {
        return;
      }

      const { error } = await supabase
        .from('entity_assignees')
        .insert({
          assigned_by: user.id,
          entity_id: selectedFormId,
          entity_type: 'form',
          user_id: member.id
        });

      if (error) {
        console.error('Error adding assignee:', error);
        setAssigneeError('Failed to add assignee');
        return;
      }

      // Add the new assignee to the state
      setAssignees([...assignees, {
        id: member.id,
        name: member.name,
        avatar_url: member.avatar_url,
      }]);
    } catch (err) {
      console.error('Exception adding assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  const handleAssigneeRemove = async (memberId: string) => {
    if (selectedFormId === null) return;
    setAssigneeError(null);
    
    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('entity_assignees')
        .delete()
        .eq('entity_type', 'form')
        .eq('entity_id', selectedFormId)
        .eq('user_id', memberId);

      if (error) {
        console.error('Error removing assignee:', error);
        setAssigneeError('Failed to remove assignee');
        return;
      }

      // Remove the assignee from the state
      setAssignees(assignees.filter(a => a.id !== memberId));
    } catch (err) {
      console.error('Exception removing assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  const handleAnswerChange = (itemId: number, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: value,
    }));

    // Clear error for this field if it exists
    if (formErrors[itemId]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[itemId];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<number, string> = {};
    
    // Check for entry name
    if (!entryName.trim()) {
      toast.error("Please provide an entry name");
      return false;
    }
    
    // Check for required fields
    if (formDetail) {
      formDetail.items.forEach((item) => {
        if (item.is_required && (!answers[item.id!] || answers[item.id!] === "")) {
          newErrors[item.id!] = "This field is required";
        }
      });
    }
    
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitEntry = async () => {
    if (!user?.id || !formDetail || !selectedFormId) return;
    
    if (!validateForm()) {
      toast.error("Please fill all required fields");
      return;
    }
    
    try {
      setIsSubmittingEntry(true);
      
      // Prepare data for submission
      const entryAnswers = Object.entries(answers).map(([itemId, value]) => ({
        itemId: parseInt(itemId),
        value: value
      }));
      
      const response = await createFormEntry({
        formId: selectedFormId,
        userId: user.id,
        name: entryName || formDetail.form.name,
        answers: entryAnswers
      });
      
      toast.success("Form entry submitted successfully");
      
      // Navigate to entries page and open the detail panel
      router.push(`/protected/entries?entryId=${response.entry.id}`);
    } catch (error) {
      console.error("Error submitting form entry:", error);
      toast.error("Failed to submit form entry");
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const renderFormItem = (item: FormItem) => {
    const itemId = item.id!;
    const hasError = !!formErrors[itemId];
    
    switch (item.item_type) {
      case "question":
        return (
          <div className="space-y-2">
            <Label htmlFor={`question-${itemId}`} className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={`question-${itemId}`}
              value={answers[itemId] || ""}
              onChange={(e) => handleAnswerChange(itemId, e.target.value)}
              className={hasError ? "border-red-500" : ""}
            />
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "radio_box":
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={answers[itemId] || ""}
              onValueChange={(value) => handleAnswerChange(itemId, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {item.options?.filter(option => option.trim() !== "").map((option, index) => (
                  <SelectItem key={index} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "checklist":
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <div className="space-y-2">
              {item.options?.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`checkbox-${itemId}-${index}`}
                    checked={(answers[itemId] || []).includes(option)}
                    onCheckedChange={(checked) => {
                      const currentValues = answers[itemId] || [];
                      const newValues = checked
                        ? [...currentValues, option]
                        : currentValues.filter((v: string) => v !== option);
                      handleAnswerChange(itemId, newValues);
                    }}
                  />
                  <Label htmlFor={`checkbox-${itemId}-${index}`}>{option}</Label>
                </div>
              ))}
            </div>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "photo":
        // Placeholder for photo upload (would need additional components)
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Card className="bg-muted/40">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <p className="text-muted-foreground text-sm">Photo upload not yet implemented</p>
              </CardContent>
            </Card>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Forms</h1>
          <p className="text-muted-foreground">
            Create and manage forms
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search forms..."
              className="pl-8"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Form
          </Button>
        </div>
      </div>

      <div className="border shadow-sm rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">{error}</TableCell>
              </TableRow>
            ) : filteredForms.length > 0 ? (
              filteredForms.map((form) => (
                <TableRow key={form.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell 
                    className="font-medium"
                    onClick={() => handleViewForm(form.id)}
                  >
                    {form.name}
                  </TableCell>
                  <TableCell onClick={() => handleViewForm(form.id)}>
                    <Badge 
                      variant="secondary" 
                      className={
                        form.is_synced 
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {form.is_synced ? 'Completed' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={() => handleViewForm(form.id)}>
                    {form.created_at && format(new Date(form.created_at), 'PP')}
                  </TableCell>
                  <TableCell onClick={() => handleViewForm(form.id)}>
                    {form.updated_at && format(new Date(form.updated_at), 'PP')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleCreateEntry(form.id)}
                    >
                      Create entry
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  {searchTerm
                    ? "No forms match your search"
                    : "No forms found. Create a new form to get started."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CreateFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onFormCreated={(newForm: Form) => {
          setForms([newForm, ...forms]);
          if (newForm.id) {
            handleViewForm(newForm.id);
          }
        }}
      />
      
      <Sheet open={selectedFormId !== null} onOpenChange={handleSheetOpenChange}>
        <SheetTitle />
        <SheetContent
          className={`h-full w-full md:w-[40vw] md:max-w-[40vw] border-l p-0 transition-transform duration-300 focus:outline-none focus-visible:outline-none [&>button]:hidden ${
            isClosing ? 'translate-x-full' : 'translate-x-0'
          }`}
          side="right"
        >
          {loadingDetail ? (
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between p-6 border-b">
                <div className="space-y-1">
                  <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCloseDetail}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Questions</h3>
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-24 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : !formDetail ? (
            <div className="flex items-center justify-center h-full">
              <p>Form not found</p>
            </div>
          ) : isCreatingEntry ? (
            // Form Entry Creation UI
            <div className="h-full flex flex-col">
              <div className="p-6 border-b">
                <div className="flex items-start gap-4">
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={handleCloseEntryForm}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold mb-2">{formDetail.form.name}</h2>
                    {assignedBy && (
                      <p className="text-sm text-muted-foreground">Assigned by {assignedBy}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="entry-name" className="font-medium">
                        Entry Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="entry-name"
                        value={entryName}
                        onChange={(e) => setEntryName(e.target.value)}
                        placeholder="Give this entry a name"
                      />
                    </div>
                    
                    {formDetail.items.map((item) => (
                      <div key={item.id} className="border rounded-lg p-4">
                        {renderFormItem(item)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t">
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleCloseEntryForm}
                    disabled={isSubmittingEntry}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmitEntry}
                    disabled={isSubmittingEntry}
                  >
                    {isSubmittingEntry ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="p-6 border-b">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="relative mb-2">
                        <TextareaAutosize
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="w-full text-2xl font-semibold bg-background border border-muted px-3 py-2 pr-8 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[auto] resize-none overflow-hidden rounded-md"
                          aria-label="Form title"
                          placeholder="Enter form title"
                          maxRows={3}
                        />
                        <Pencil className="h-4 w-4 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
                      </div>
                    ) : (
                      <h2 className="text-2xl font-semibold mb-2">{formDetail.form.name}</h2>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={getStatusColor()}>
                        {getStatusText()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Last updated {formDetail.form.updated_at ? format(new Date(formDetail.form.updated_at), 'MMM d, yyyy') : 'Never'}
                      </span>
                    </div>
                    {!isEditing && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => handleCreateEntry(selectedFormId || undefined)}
                      >
                        Create entry
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (isEditing) {
                          handleSave();
                        } else {
                          setIsEditing(true);
                        }
                      }}
                      disabled={isSaving}
                    >
                      {isEditing ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (isEditing) {
                          if (hasChanges()) {
                            if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                              setIsEditing(false);
                              setEditedTitle(formDetail?.form.name || "");
                              setEditedItems(formDetail?.items || []);
                            }
                          } else {
                            setIsEditing(false);
                            setEditedTitle(formDetail?.form.name || "");
                            setEditedItems(formDetail?.items || []);
                          }
                        } else {
                          handleCloseDetail();
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <AssigneeSelector
                    assignees={assignees}
                    onAssign={handleAssigneeAdd}
                    onUnassign={handleAssigneeRemove}
                    error={assigneeError}
                    disabled={!user?.id}
                  />
                </div>

                <div>
                  <h3 className="mb-4 text-lg font-semibold">Questions</h3>
                  <div className="space-y-4">
                    {isEditing ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={editedItems.map(item => item.id?.toString() || item.display_order.toString())}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-4">
                            {editedItems.map((item, index) => (
                              <SortableQuestionCard
                                key={item.id || index}
                                question={toFormBuilderQuestion(item)}
                                onUpdate={updateQuestion}
                                onDelete={deleteQuestion}
                                isFirst={index === 0}
                                isEditing={isEditing}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="space-y-4">
                        {editedItems.map((item, index) => (
                          <SortableQuestionCard
                            key={item.id || index}
                            question={toFormBuilderQuestion(item)}
                            onUpdate={updateQuestion}
                            onDelete={deleteQuestion}
                            isFirst={index === 0}
                            isEditing={isEditing}
                          />
                        ))}
                      </div>
                    )}
                    
                    {isEditing && (
                      <Button
                        variant="outline"
                        className="w-full mt-4"
                        onClick={addQuestion}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add question
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Default export using the wrapper
export default function FormsPage() {
  return (
    <Suspense fallback={<div className="container py-6">Loading forms...</div>}>
      <SearchParamsWrapper />
    </Suspense>
  );
} 