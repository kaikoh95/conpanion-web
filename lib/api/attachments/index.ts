import { createClient } from '@/utils/supabase/client';
import {
  Attachment,
  AttachmentType,
  AttachmentFileType,
  CreateAttachmentRequest,
  DeleteAttachmentRequest,
  AttachmentResponse,
  AttachmentsResponse,
} from '@/lib/types/attachment';

const supabase = createClient();

/**
 * Determine the attachment file type based on MIME type and extension
 */
function determineFileType(file: File): AttachmentFileType {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop() || '';

  // Check by MIME type first
  if (mimeType.startsWith('image/')) {
    return 'image';
  } else if (mimeType.startsWith('video/')) {
    return 'video';
  } else if (mimeType.startsWith('audio/')) {
    return 'audio';
  } else if (mimeType === 'application/pdf') {
    return 'pdf';
  } else if (
    [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
    ].includes(mimeType)
  ) {
    return 'document';
  } else if (
    [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ].includes(mimeType)
  ) {
    return 'spreadsheet';
  } else if (
    [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(mimeType)
  ) {
    return 'presentation';
  }

  // Fall back to extension if MIME type doesn't provide clear info
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension)) {
    return 'image';
  } else if (['mp4', 'avi', 'mov', 'webm'].includes(extension)) {
    return 'video';
  } else if (['mp3', 'wav', 'ogg'].includes(extension)) {
    return 'audio';
  } else if (extension === 'pdf') {
    return 'pdf';
  } else if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(extension)) {
    return 'document';
  } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
    return 'spreadsheet';
  } else if (['ppt', 'pptx'].includes(extension)) {
    return 'presentation';
  } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(extension)) {
    return 'archive';
  } else if (['txt', 'md', 'json', 'xml', 'html', 'css', 'js'].includes(extension)) {
    return 'text';
  }

  // Default fallback
  return 'other';
}

/**
 * Upload a file and create an attachment record
 */
export async function uploadAttachment({
  projectId,
  entityType,
  entityId,
  file,
}: CreateAttachmentRequest): Promise<AttachmentResponse> {
  try {
    // Generate a unique file name to avoid collisions
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;

    // Define the path for the file in storage
    const filePath = `${projectId}/${entityType}/${entityId}/${uniqueFileName}`;

    // Upload the file to storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (storageError) {
      console.error('Error uploading file:', storageError);
      return { data: null, error: storageError };
    }

    // Determine the correct file type enum value
    const fileType = determineFileType(file);

    // Create the attachment record in the database
    const { data: attachmentData, error: attachmentError } = await supabase
      .from('attachments')
      .insert({
        project_id: projectId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: uniqueFileName,
        file_size: file.size,
        file_type: fileType,
        storage_path: filePath,
      })
      .select()
      .single();

    if (attachmentError) {
      console.error('Error creating attachment record:', attachmentError);

      // Clean up the uploaded file if the record creation fails
      await supabase.storage.from('attachments').remove([filePath]);

      return { data: null, error: attachmentError };
    }

    return { data: attachmentData as Attachment, error: null };
  } catch (error) {
    console.error('Error in uploadAttachment:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all attachments for a specific entity
 */
export async function getAttachments(
  entityType: AttachmentType,
  entityId: string,
): Promise<AttachmentsResponse> {
  try {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching attachments:', error);
      return { data: null, error };
    }

    return { data: data as Attachment[], error: null };
  } catch (error) {
    console.error('Error in getAttachments:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get a single attachment by ID
 */
export async function getAttachment(attachmentId: string): Promise<AttachmentResponse> {
  try {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', attachmentId)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('Error fetching attachment:', error);
      return { data: null, error };
    }

    return { data: data as Attachment, error: null };
  } catch (error) {
    console.error('Error in getAttachment:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete an attachment (soft delete)
 */
export async function deleteAttachment({
  attachmentId,
}: DeleteAttachmentRequest): Promise<AttachmentResponse> {
  try {
    // Fetch the attachment to get its storage path
    const { data: attachment, error: fetchError } = await getAttachment(attachmentId);

    if (fetchError || !attachment) {
      console.error('Error fetching attachment for deletion:', fetchError);
      return { data: null, error: fetchError || new Error('Attachment not found') };
    }

    // Soft delete the attachment record
    const { data, error } = await supabase
      .from('attachments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', attachmentId)
      .select()
      .single();

    if (error) {
      console.error('Error deleting attachment:', error);
      return { data: null, error };
    }

    return { data: data as Attachment, error: null };
  } catch (error) {
    console.error('Error in deleteAttachment:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Hard delete an attachment and its file
 */
export async function hardDeleteAttachment(attachmentId: string): Promise<AttachmentResponse> {
  try {
    // Fetch the attachment to get its storage path
    const { data: attachment, error: fetchError } = await getAttachment(attachmentId);

    if (fetchError || !attachment) {
      console.error('Error fetching attachment for deletion:', fetchError);
      return { data: null, error: fetchError || new Error('Attachment not found') };
    }

    // Delete the file from storage
    const { error: storageError } = await supabase.storage
      .from('attachments')
      .remove([attachment.storage_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      return { data: null, error: storageError };
    }

    // Delete the attachment record
    const { data, error } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachmentId)
      .select()
      .single();

    if (error) {
      console.error('Error hard deleting attachment:', error);
      return { data: null, error };
    }

    return { data: data as Attachment, error: null };
  } catch (error) {
    console.error('Error in hardDeleteAttachment:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get a signed URL to access a file
 */
export async function getAttachmentUrl(
  attachmentId: string,
): Promise<{ url: string | null; error: Error | null }> {
  try {
    // Fetch the attachment to get its storage path
    const { data: attachment, error: fetchError } = await getAttachment(attachmentId);

    if (fetchError || !attachment) {
      console.error('Error fetching attachment for URL:', fetchError);
      return { url: null, error: fetchError || new Error('Attachment not found') };
    }

    // Get a signed URL that's valid for 60 minutes
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.storage_path, 60 * 60);

    if (error) {
      console.error('Error creating signed URL:', error);
      return { url: null, error };
    }

    return { url: data.signedUrl, error: null };
  } catch (error) {
    console.error('Error in getAttachmentUrl:', error);
    return { url: null, error: error as Error };
  }
}
