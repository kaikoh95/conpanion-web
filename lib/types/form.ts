export type ItemType = 'question' | 'checklist' | 'radio_box' | 'photo';

export interface FormItem {
  id?: number;
  form_id?: number;
  item_type: ItemType;
  question_value: string;
  options?: any[];
  is_required: boolean;
  display_order: number;
}

export interface Form {
  id?: number;
  name: string;
  owner_id?: string;
  team_id?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  assigned_to?: string[];
  version?: number;
  is_synced?: boolean;
  last_synced_at?: string;
  items?: FormItem[];
}

export interface CreateFormRequest {
  name: string;
  description?: string;
  items: Omit<FormItem, 'id' | 'form_id'>[];
}

export interface UpdateFormRequest {
  name?: string;
  description?: string;
  items?: Omit<FormItem, 'id' | 'form_id'>[];
}

export interface FormResponse {
  form: Form;
  items: FormItem[];
} 