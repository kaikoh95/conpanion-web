"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Pencil, Check, Plus, Trash2, GripVertical, CircleDot, CheckSquare } from "lucide-react";
import { getFormById, updateForm } from "@/lib/api/forms";
import { FormResponse, FormItem, ItemType } from "@/lib/types/form";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableQuestionCard } from "@/components/forms/sortable-question-card";
import { FormBuilderQuestion } from "@/lib/types/form-builder";

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

export default function FormDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [form, setForm] = useState<FormResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedItems, setEditedItems] = useState<FormItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const data = await getFormById(parseInt(resolvedParams.id));
        setForm(data);
        setEditedTitle(data?.form.name || "");
        setEditedItems(data?.items || []);
      } catch (error) {
        console.error("Error fetching form:", error);
        toast.error("Failed to load form");
      } finally {
        setIsLoading(false);
      }
    };

    fetchForm();
  }, [resolvedParams.id]);

  const hasChanges = () => {
    if (!form) return false;
    
    // Check if title has changed
    if (editedTitle.trim() !== form.form.name) return true;
    
    // Check if number of items has changed
    if (editedItems.length !== form.items.length) return true;
    
    // Check if any items have changed
    return editedItems.some((editedItem, index) => {
      const originalItem = form.items[index];
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
    if (!form) return;
    
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
      
      await updateForm(parseInt(resolvedParams.id), {
        name: editedTitle.trim(),
        items: itemsToUpdate,
      });
      
      // Update local state
      setForm({
        ...form,
        form: {
          ...form.form,
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
    if (!form) return 'bg-muted text-muted-foreground';
    if (form.form.is_synced) {
      return 'bg-green-500/10 text-green-700 dark:text-green-400';
    } else if (form.form.assigned_to?.length) {
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    } else {
      return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = () => {
    if (!form) return 'Loading...';
    if (form.form.is_synced) {
      return 'Completed';
    } else if (form.form.assigned_to?.length) {
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

  const handleClose = () => {
    setIsClosing(true);
    // Add delay to match animation duration before navigating back
    setTimeout(() => {
      router.push('/protected/forms');
    }, 300);
  };

  return (
    <Sheet 
      open={true} 
      onOpenChange={() => {
        if (isEditing) {
          if (hasChanges()) {
            if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
              setIsEditing(false);
              setEditedTitle(form?.form.name || "");
              setEditedItems(form?.items || []);
            }
          } else {
            setIsEditing(false);
            setEditedTitle(form?.form.name || "");
            setEditedItems(form?.items || []);
          }
        } else {
          handleClose();
        }
      }} 
      modal={false}
    >
      <SheetContent 
        className={`!w-[40vw] !max-w-[40vw] h-full p-0 border-l [&>button]:hidden focus-visible:outline-none focus:outline-none transition-transform duration-300 ${
          isClosing ? 'translate-x-full' : 'translate-x-0'
        }`}
        side="right"
      >
        {isLoading ? (
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
                  onClick={handleClose}
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
        ) : !form ? (
          <div className="flex items-center justify-center h-full">
            <p>Form not found</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between p-6 border-b">
              <div className="space-y-1">
                {isEditing ? (
                  <div className="relative">
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-2xl font-semibold bg-background border-input px-3 py-2 hover:border-primary/50 focus-visible:ring-1"
                      aria-label="Form title"
                      placeholder="Enter form title"
                    />
                    <Pencil className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                ) : (
                  <h2 className="text-2xl font-semibold">{form.form.name}</h2>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={getStatusColor()}>
                    {getStatusText()}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Last updated {form.form.updated_at ? format(new Date(form.form.updated_at), 'MMM d, yyyy') : 'Never'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                          setEditedTitle(form?.form.name || "");
                          setEditedItems(form?.items || []);
                        }
                      } else {
                        setIsEditing(false);
                        setEditedTitle(form?.form.name || "");
                        setEditedItems(form?.items || []);
                      }
                    } else {
                      handleClose();
                    }
                  }}
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

                <div>
                  <h3 className="text-lg font-semibold mb-4">Assignments</h3>
                  <div className="p-4 border rounded-lg">
                    {form.form.assigned_to && form.form.assigned_to.length > 0 ? (
                      <p>{form.form.assigned_to.length} user(s) assigned</p>
                    ) : (
                      <p className="text-muted-foreground">No users assigned</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
} 