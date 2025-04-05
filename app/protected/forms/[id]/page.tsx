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

const questionTypes = [
  { value: "question", label: "Short answer" },
  { value: "radio_box", label: "Multiple choice" },
  { value: "checklist", label: "Checkboxes" },
  { value: "photo", label: "Photo" },
] as const;

// Add SortableQuestionCard component
function SortableQuestionCard({ item, index, isEditing, onUpdate, onDelete }: { 
  item: FormItem; 
  index: number;
  isEditing: boolean;
  onUpdate: (index: number, updates: Partial<FormItem>) => void;
  onDelete?: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id?.toString() || item.display_order.toString()
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    transition,
  } : undefined;

  const renderQuestionPreview = () => {
    switch (item.item_type) {
      case "question":
        return (
          <div className="border rounded-md px-3 py-2 bg-muted/30">
            <p className="text-sm text-muted-foreground">Text answer</p>
          </div>
        );
      case "photo":
        return (
          <div className="border rounded-md px-3 py-2 bg-muted/30">
            <p className="text-sm text-muted-foreground">Photo upload</p>
          </div>
        );
      case "radio_box":
      case "checklist":
        return (
          <div className="space-y-2 mt-2">
            {item.options?.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2 pl-1">
                {item.item_type === "radio_box" ? (
                  <CircleDot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <CheckSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm text-muted-foreground">{option}</span>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Card 
        className={`p-4 ${isDragging ? 'shadow-lg ring-1 ring-primary/20 opacity-50' : ''} transition-shadow duration-200`}
      >
        <div className="flex items-start gap-4">
          {isEditing && (
            <div 
              className="flex-none cursor-grab active:cursor-grabbing touch-none" 
              {...attributes} 
              {...listeners}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
              {isEditing ? (
                <Input
                  value={item.question_value}
                  onChange={(e) => onUpdate(index, { question_value: e.target.value })}
                  className="text-lg"
                  placeholder="Question here"
                />
              ) : (
                <p className="text-lg font-medium">{item.question_value}</p>
              )}
              {isEditing && (
                <Select
                  value={item.item_type}
                  onValueChange={(value) =>
                    onUpdate(index, {
                      item_type: value as ItemType,
                      options: value === "radio_box" || value === "checklist" ? [""] : [],
                    })
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select type">
                      {questionTypes.find(type => type.value === item.item_type)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {questionTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {!isEditing ? (
              renderQuestionPreview()
            ) : (
              <>
                {(item.item_type === "radio_box" || item.item_type === "checklist") && (
                  <div className="space-y-2 mt-2">
                    {item.options?.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2 pl-1">
                        {item.item_type === "radio_box" ? (
                          <CircleDot className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <CheckSquare className="h-4 w-4 flex-shrink-0" />
                        )}
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={option}
                            onChange={(e) => onUpdate(index, {
                              options: item.options?.map((opt, j) => 
                                j === optionIndex ? e.target.value : opt
                              )
                            })}
                            className="flex-1"
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onUpdate(index, {
                              options: item.options?.filter((_, j) => j !== optionIndex)
                            })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => onUpdate(index, {
                        options: [...(item.options || []), ""]
                      })}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add option
                    </Button>
                  </div>
                )}
                {item.item_type === "question" && (
                  <div className="space-y-2">
                    <div className="border rounded-md px-3 py-2 bg-muted/30">
                      <p className="text-sm text-muted-foreground">Text answer</p>
                    </div>
                  </div>
                )}
                {item.item_type === "photo" && (
                  <div className="space-y-2">
                    <div className="border rounded-md px-3 py-2 bg-muted/30">
                      <p className="text-sm text-muted-foreground">Photo upload</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {isEditing && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`required-${item.id || index}`}
                    checked={item.is_required}
                    onCheckedChange={(checked) =>
                      onUpdate(index, { is_required: checked as boolean })
                    }
                  />
                  <label
                    htmlFor={`required-${item.id || index}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Required
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete?.(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

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
        setIsLoading(true);
        const data = await getFormById(parseInt(resolvedParams.id));
        setForm(data);
        setEditedTitle(data?.form.name || "");
        setEditedItems(data?.items || []);
      } catch (error) {
        console.error("Error fetching form:", error);
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

  const updateQuestion = (index: number, updates: Partial<FormItem>) => {
    setEditedItems(items => 
      items.map((item, i) => 
        i === index ? { ...item, ...updates } : item
      )
    );
  };

  const addOption = (index: number) => {
    setEditedItems(items => 
      items.map((item, i) => 
        i === index ? {
          ...item,
          options: [...(item.options || []), "New option"]
        } : item
      )
    );
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    setEditedItems(items => 
      items.map((item, i) => 
        i === questionIndex ? {
          ...item,
          options: item.options?.map((opt, j) => 
            j === optionIndex ? value : opt
          )
        } : item
      )
    );
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setEditedItems(items => 
      items.map((item, i) => 
        i === questionIndex ? {
          ...item,
          options: item.options?.filter((_, j) => j !== optionIndex)
        } : item
      )
    );
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
          <div className="flex items-center justify-center h-full">
            <p>Loading form details...</p>
          </div>
        ) : !form ? (
          <div className="flex items-center justify-center h-full">
            <p>Form not found</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex-1 mr-4">
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
                <div className="flex items-center gap-2 mt-1">
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
                                item={item}
                                index={index}
                                isEditing={isEditing}
                                onUpdate={updateQuestion}
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
                            item={item}
                            index={index}
                            isEditing={isEditing}
                            onUpdate={updateQuestion}
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