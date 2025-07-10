import { createClient } from '@/utils/supabase/client';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Attachment, AttachmentFileType } from '@/lib/types/attachment';

// Use createClient to match the pattern in other attachment APIs
const supabase = createClient();

// Type definitions
type TaskAttachmentResponse = {
  data: Attachment[] | null;
  error: Error | null;
};

type UploadTaskAttachmentResponse = {
  data: Attachment | null;
  error: Error | null;
};

interface UploadTaskAttachmentRequest {
  taskId: number;
  file: File;
}

/**
 * Determine the attachment file type based on extension
 */
function determineFileType(file: File): AttachmentFileType {
  const fileName = file.name.toLowerCase();
  const extension = fileName.split('.').pop() || '';

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

// Get all attachments for a specific task
export async function getTaskAttachments(taskId: number): Promise<TaskAttachmentResponse> {
  try {
    // Use direct query instead of RPC due to type issues
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', 'task')
      .eq('entity_id', taskId.toString())
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching task attachments:', error);
      return { data: null, error };
    }

    return { data: data as Attachment[], error: null };
  } catch (error) {
    console.error('Exception in getTaskAttachments:', error);
    return { data: null, error: error as Error };
  }
}

// Upload a file and create a task attachment record
export async function uploadTaskAttachment({
  taskId,
  file,
}: UploadTaskAttachmentRequest): Promise<UploadTaskAttachmentResponse> {
  try {
    // First get the project ID for this task
    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', taskId)
      .single();

    if (taskError) {
      console.error('Error fetching task project ID:', taskError);
      return { data: null, error: taskError };
    }

    const projectId = taskData.project_id;
    if (!projectId) {
      return {
        data: null,
        error: new Error('Task does not have an associated project ID'),
      };
    }

    // Generate a unique file name to avoid collisions
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const originalName = file.name;
    const fileExtension = originalName.split('.').pop() || '';
    const uniqueFileName = `${timestamp}_${randomString}_${originalName}`;

    // Define the path for the file in storage
    // The path structure should match RLS policies: projectId/task/taskId/filename
    const filePath = `${projectId}/task/${taskId}/${uniqueFileName}`;

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

    // Determine the file type
    const fileType = determineFileType(file);

    // Create the attachment record in the database directly
    const { data: attachmentData, error: attachmentError } = await supabase
      .from('attachments')
      .insert({
        project_id: projectId,
        entity_type: 'task',
        entity_id: taskId.toString(),
        file_name: uniqueFileName,
        file_size: file.size,
        file_type: fileType,
        storage_path: filePath,
      })
      .select()
      .single();

    if (attachmentError) {
      console.error('Error creating task attachment record:', attachmentError);

      // Clean up the uploaded file if the record creation fails
      await supabase.storage.from('attachments').remove([filePath]);

      return { data: null, error: attachmentError };
    }

    // Update task metadata to indicate it has attachments
    try {
      const { error: metadataError } = await supabase.from('task_metadata').upsert(
        {
          task_id: taskId,
          title: 'has_attachments',
          value: 'true',
          created_by: (await supabase.auth.getUser()).data.user?.id || '',
        },
        {
          onConflict: 'task_id,title',
        },
      );

      if (metadataError) {
        console.error('Error updating task metadata:', metadataError);
        // Continue anyway as the attachment was created successfully
      }
    } catch (metadataErr) {
      console.error('Exception updating task metadata:', metadataErr);
      // Continue anyway
    }

    return { data: attachmentData as Attachment, error: null };
  } catch (error) {
    console.error('Exception in uploadTaskAttachment:', error);
    return { data: null, error: error as Error };
  }
}

// Delete a task attachment
export async function deleteTaskAttachment(
  attachmentId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Get the attachment record to know the storage path
    const { data, error: fetchError } = await supabase
      .from('attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .single();

    if (fetchError) {
      console.error('Error fetching attachment:', fetchError);
      return { success: false, error: fetchError };
    }

    // Delete the attachment record
    const { error: deleteError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) {
      console.error('Error deleting attachment record:', deleteError);
      return { success: false, error: deleteError };
    }

    // Delete the file from storage
    if (data?.storage_path) {
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([data.storage_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // We don't return error here as the database record was successfully deleted
      }
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception in deleteTaskAttachment:', error);
    return { success: false, error: error as Error };
  }
}

// Get a signed URL for a task attachment
export async function getTaskAttachmentUrl(
  attachmentId: string,
): Promise<{ url: string | null; error: Error | null }> {
  try {
    // Get the attachment record to know the storage path
    const { data, error: fetchError } = await supabase
      .from('attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .single();

    if (fetchError) {
      console.error('Error fetching attachment:', fetchError);
      return { url: null, error: fetchError };
    }

    if (!data?.storage_path) {
      return { url: null, error: new Error('Attachment has no storage path') };
    }

    // Create a signed URL that expires in 1 hour
    const { data: urlData, error: urlError } = await supabase.storage
      .from('attachments')
      .createSignedUrl(data.storage_path, 60 * 60);

    if (urlError) {
      console.error('Error creating signed URL:', urlError);
      return { url: null, error: urlError };
    }

    return { url: urlData.signedUrl, error: null };
  } catch (error) {
    console.error('Exception in getTaskAttachmentUrl:', error);
    return { url: null, error: error as Error };
  }
}
