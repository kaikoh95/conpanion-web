import { Form } from '@/lib/types/form';

export type QuestionType = 'question' | 'checklist' | 'radio_box' | 'photo';

export interface FormBuilderQuestion {
  id: string;
  type: QuestionType;
  title: string;
  options?: string[];
  required: boolean;
}

export interface FormBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFormCreated?: (newForm: Form) => void;
}

export interface SortableQuestionCardProps {
  question: FormBuilderQuestion;
  onUpdate: (id: string, updates: Partial<FormBuilderQuestion>) => void;
  onDelete: (id: string) => void;
  isFirst: boolean;
  isEditing: boolean;
}
