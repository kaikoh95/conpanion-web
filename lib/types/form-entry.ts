export interface FormEntry {
  id?: number;
  form_id: number;
  submitted_by_user_id: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  is_synced?: boolean;
  last_synced_at?: string | null;
}

export interface FormEntryAnswer {
  id?: number;
  entry_id: number;
  item_id: number;
  answer_value: any;
  created_at?: string;
}

export interface CreateFormEntryRequest {
  formId: number;
  userId: string;
  name?: string;
  answers?: {
    itemId: number;
    value: any;
  }[];
}

export interface FormEntryResponse {
  entry: FormEntry;
  answers: FormEntryAnswer[];
}
