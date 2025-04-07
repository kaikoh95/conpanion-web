import { QuestionType } from "@/lib/types/form-builder";
import { FormItem } from "@/lib/types/form";

export const mapQuestionTypeToItemType = (type: QuestionType): "question" | "checklist" | "radio_box" | "photo" => {
  switch (type) {
    case "short":
    case "long":
      return "question";
    case "radio":
      return "radio_box";
    case "checkbox":
      return "checklist";
    default:
      return "question";
  }
};

export const generateFormItems = (questions: { 
  type: QuestionType; 
  title: string; 
  options?: string[]; 
  required: boolean; 
}[]): Omit<FormItem, 'id' | 'form_id'>[] => {
  return questions.map((question, index) => ({
    item_type: mapQuestionTypeToItemType(question.type),
    question_value: question.title,
    options: question.type === "radio" || question.type === "checkbox" ? question.options || [] : [],
    is_required: question.required,
    display_order: index,
  }));
}; 