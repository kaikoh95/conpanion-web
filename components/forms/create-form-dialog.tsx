"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createForm } from "@/lib/api/forms";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { FormBuilderProps, FormBuilderQuestion } from "@/lib/types/form-builder";
import { generateFormItems } from "@/lib/utils/form-utils";
import { SortableQuestionCard } from "./sortable-question-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CreateFormDialog({ open, onOpenChange, onFormCreated }: FormBuilderProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<FormBuilderQuestion[]>([
    {
      id: "1",
      type: "question",
      title: "",
      required: false,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addQuestion = () => {
    const newQuestion: FormBuilderQuestion = {
      id: String(questions.length + 1),
      type: "question",
      title: "",
      required: false,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<FormBuilderQuestion>) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const hasUnsavedChanges = () => {
    return title.trim() !== "" || questions.some(q => q.title.trim() !== "" || q.options?.some(opt => opt.trim() !== ""));
  };

  const handleClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(open);
    }
  };

  const handleDiscard = () => {
    setTitle("");
    setQuestions([{
      id: "1",
      type: "question",
      title: "",
      required: false,
    }]);
    setShowDiscardDialog(false);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      await createForm({
        name: title.trim() || "New form",
        items: generateFormItems(questions),
      });

      toast.success("Form created successfully");
      onOpenChange(false);
      onFormCreated?.();
      router.refresh(); // Refresh the page to show the new form
    } catch (error) {
      console.error("Error creating form:", error);
      toast.error("Failed to create form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">Create Form</DialogTitle>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New form"
              className="text-2xl font-semibold border-none bg-transparent focus-visible:ring-0 px-0 text-foreground placeholder:text-muted-foreground/60"
            />
          </DialogHeader>

          <div className="space-y-4 my-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[]}
            >
              <SortableContext
                items={questions.map(q => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <SortableQuestionCard
                      key={question.id}
                      question={question}
                      onUpdate={updateQuestion}
                      onDelete={deleteQuestion}
                      isFirst={index === 0}
                      isEditing={true}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={addQuestion}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add question
          </Button>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discard your changes? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 