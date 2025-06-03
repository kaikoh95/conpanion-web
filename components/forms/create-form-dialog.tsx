'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { createForm } from '@/lib/api/forms';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { FormBuilderProps, FormBuilderQuestion } from '@/lib/types/form-builder';
import { generateFormItems } from '@/lib/utils/form-utils';
import { SortableQuestionCard } from './sortable-question-card';
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
import { useAuth } from '@/hooks/useAuth';
import { AssigneeSelector } from '@/components/AssigneeSelector';
import { ProjectMember } from '@/hooks/useProjectMembers';
import { getSupabaseClient } from '@/lib/supabase/client';

export function CreateFormDialog({ open, onOpenChange, onFormCreated }: FormBuilderProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<FormBuilderQuestion[]>([
    {
      id: '1',
      type: 'question',
      title: '',
      required: false,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const { user } = useAuth();
  const [assignees, setAssignees] = useState<{ id: string; name: string; avatar_url?: string }[]>(
    [],
  );
  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!user) {
    return null;
  }

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
      type: 'question',
      title: '',
      required: false,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<FormBuilderQuestion>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const hasUnsavedChanges = () => {
    return (
      title.trim() !== '' ||
      questions.some((q) => q.title.trim() !== '' || q.options?.some((opt) => opt.trim() !== ''))
    );
  };

  const handleClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(open);
    }
  };

  const handleDiscard = () => {
    setTitle('');
    setQuestions([
      {
        id: '1',
        type: 'question',
        title: '',
        required: false,
      },
    ]);
    setShowDiscardDialog(false);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Create the form first
      const formResponse = await createForm({
        name: title.trim() || 'New form',
        items: generateFormItems(questions),
        userId: user.id,
        projectId: user.activeProjectId,
      });

      // If there are assignees and we have a valid form ID, add them
      const formId = formResponse.form.id;
      if (assignees.length > 0 && typeof formId === 'number') {
        const supabase = getSupabaseClient();
        const assigneeRecords = assignees.map((assignee) => ({
          assigned_by: user.id,
          entity_id: formId,
          entity_type: 'form',
          user_id: assignee.id,
        }));

        const { error: assigneeError } = await supabase
          .from('entity_assignees')
          .insert(assigneeRecords);

        if (assigneeError) {
          console.error('Error adding assignees:', assigneeError);
          toast.error('Failed to add some assignees');
        }
      }

      toast.success('Form created successfully');
      onOpenChange(false);
      if (onFormCreated) {
        onFormCreated(formResponse.form);
      }
      router.refresh();
    } catch (error) {
      console.error('Error creating form:', error);
      toast.error('Failed to create form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full overflow-y-auto md:w-[40vw] md:max-w-[40vw]">
          <SheetHeader>
            <SheetTitle className="sr-only">Create Form</SheetTitle>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New form"
              className="border-none bg-transparent px-0 text-2xl font-semibold text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0"
            />
          </SheetHeader>

          <div className="my-4">
            <AssigneeSelector
              assignees={assignees}
              onAssign={(member: ProjectMember) => {
                setAssignees([...assignees, member]);
              }}
              onUnassign={(memberId: string) => {
                setAssignees(assignees.filter((a) => a.id !== memberId));
              }}
              error={assigneeError}
              disabled={isSubmitting}
            />
          </div>

          <div className="my-4 space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[]}
            >
              <SortableContext
                items={questions.map((q) => q.id)}
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

          <Button variant="outline" className="w-full" onClick={addQuestion}>
            <Plus className="mr-2 h-4 w-4" />
            Add question
          </Button>

          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create form'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
