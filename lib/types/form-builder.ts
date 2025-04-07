export type QuestionType = "short" | "long" | "radio" | "checkbox";

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
  onFormCreated?: () => void;
}

export interface SortableQuestionCardProps {
  question: FormBuilderQuestion;
  onUpdate: (id: string, updates: Partial<FormBuilderQuestion>) => void;
  onDelete: (id: string) => void;
  isFirst: boolean;
} 