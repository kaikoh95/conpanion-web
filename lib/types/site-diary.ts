import { ItemType } from './form';

export interface SiteDiaryTemplateItem {
  id?: number;
  template_id?: number;
  item_type: ItemType;
  question_value: string;
  options?: any[];
  is_required: boolean;
  display_order: number;
  metadata?: Record<string, any>;
}

// Metadata configuration for templates
export interface SiteDiaryMetadataConfig {
  enableWeather?: boolean;
  enableTemperature?: boolean;
  enableManpower?: boolean;
  enableEquipment?: boolean;
  enableMaterials?: boolean;
  enableSafety?: boolean;
  enableConditions?: boolean;
  weatherOptions?: string[];
  equipmentOptions?: string[];
  requireWeather?: boolean;
  requireTemperature?: boolean;
  requireManpower?: boolean;
  requireEquipment?: boolean;
  requireMaterials?: boolean;
  requireSafety?: boolean;
  requireConditions?: boolean;
}

export interface SiteDiaryTemplate {
  id?: number;
  name: string;
  description?: string;
  project_id: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  version?: number;
  metadata?: SiteDiaryMetadataConfig;
  items?: SiteDiaryTemplateItem[];
}

export interface SiteDiary {
  id?: number;
  template_id: number;
  project_id: number;
  name: string;
  date: string; // ISO date string
  submitted_by_user_id: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  metadata?: Record<string, any>;
}

export interface SiteDiaryAnswer {
  id?: number;
  diary_id: number;
  item_id: number;
  answer_value: any;
  created_at?: string;
}

export interface CreateSiteDiaryTemplateRequest {
  name: string;
  description?: string;
  project_id: number;
  created_by: string;
  items: SiteDiaryTemplateItem[];
  metadata?: SiteDiaryMetadataConfig;
}

export interface UpdateSiteDiaryTemplateRequest {
  name: string;
  description?: string;
  items: SiteDiaryTemplateItem[];
  metadata?: SiteDiaryMetadataConfig;
}

export interface CreateSiteDiaryRequest {
  template_id: number;
  project_id: number;
  name: string;
  date: string;
  submitted_by_user_id: string;
  metadata?: Record<string, any>;
  answers?: {
    item_id: number;
    value: any;
  }[];
}

export interface SiteDiaryTemplateResponse {
  template: SiteDiaryTemplate;
  items: SiteDiaryTemplateItem[];
}

export interface SiteDiaryResponse {
  diary: SiteDiary;
  answers: SiteDiaryAnswer[];
  template?: SiteDiaryTemplate;
  template_items?: SiteDiaryTemplateItem[];
}
