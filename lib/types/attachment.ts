import { Database } from '../supabase/types.generated';

export type AttachmentType = 'form' | 'form_entry' | 'site_diary';
export type AttachmentFileType =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'archive'
  | 'text'
  | 'other';

export interface Attachment {
  id: string;
  project_id: number;
  entity_type: AttachmentType;
  entity_id: string; // Store all entity IDs as strings
  file_name: string;
  file_size: number;
  file_type: AttachmentFileType | string; // Allow string until types are generated
  storage_path: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface CreateAttachmentRequest {
  projectId: string;
  entityType: AttachmentType;
  entityId: string;
  file: File;
}

export interface DeleteAttachmentRequest {
  attachmentId: string;
}

export interface AttachmentResponse {
  data: Attachment | null;
  error: Error | null;
}

export interface AttachmentsResponse {
  data: Attachment[] | null;
  error: Error | null;
}

// Utility type for file size formatting
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
