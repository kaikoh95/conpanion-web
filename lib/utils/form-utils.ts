import { QuestionType } from "@/lib/types/form-builder";
import { FormItem } from "@/lib/types/form";

export const mapQuestionTypeToItemType = (type: QuestionType): "question" | "checklist" | "radio_box" | "photo" => {
  switch (type) {
    case "question":
      return "question";
    case "radio_box":
      return "radio_box";
    case "checklist":
      return "checklist";
    case "photo":
      return "photo";
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
    options: question.type === "radio_box" || question.type === "checklist" ? question.options || [] : [],
    is_required: question.required,
    display_order: index,
  }));
}; 