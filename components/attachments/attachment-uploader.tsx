import { useState, useEffect, useCallback } from 'react';
import FileUpload from '@/components/file-upload';
import { toast } from 'sonner';
import { uploadAttachment } from '@/lib/api/attachments';
import { AttachmentType } from '@/lib/types/attachment';
import { Loader2 } from 'lucide-react';

export interface UploadedFile {
  file: File;
  id?: string; // Will be populated after upload
  uploading: boolean;
  error?: string;
}

interface AttachmentUploaderProps {
  projectId: string;
  entityType: AttachmentType;
  entityId: string;
  onChange: (fileId: string | null) => void;
  value: string | null; // Attachment ID
  isRequired?: boolean;
  isDisabled?: boolean;
}

export default function AttachmentUploader({
  projectId,
  entityType,
  entityId,
  onChange,
  value,
  isRequired = false,
  isDisabled = false,
}: AttachmentUploaderProps) {
  // Track the file locally before uploading
  const [fileState, setFileState] = useState<UploadedFile | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);

  // Handle file selection from the FileUpload component
  const handleFileSelected = async (file: File | null) => {
    // Clear any existing file state when a new file is selected or removed
    if (!file) {
      setFileState(null);
      setLocalFile(null);
      onChange(null);
      return;
    }

    // Store the file locally
    setLocalFile(file);
    setFileState({
      file,
      uploading: false,
      error: undefined,
    });
  };

  // Upload the file when a new one is selected
  const uploadFile = useCallback(async () => {
    if (!localFile || !projectId || !entityId) return;

    setFileState((prev) => (prev ? { ...prev, uploading: true, error: undefined } : null));

    try {
      const { data, error } = await uploadAttachment({
        projectId,
        entityType,
        entityId,
        file: localFile,
      });

      if (error) {
        toast.error('Failed to upload file');
        setFileState((prev) => (prev ? { ...prev, uploading: false, error: error.message } : null));
        return;
      }

      if (data?.id) {
        toast.success('File uploaded successfully');
        setFileState((prev) => (prev ? { ...prev, uploading: false, id: data.id } : null));
        onChange(data.id);
      }
    } catch (err: any) {
      toast.error('Failed to upload file');
      setFileState((prev) => (prev ? { ...prev, uploading: false, error: err.message } : null));
    }
  }, [localFile, projectId, entityType, entityId, onChange]);

  // Add useEffect to upload file when selected
  useEffect(() => {
    if (localFile && !fileState?.uploading && !fileState?.id) {
      uploadFile();
    }
  }, [localFile, fileState, uploadFile]);

  return (
    <div className="w-full">
      <FileUpload
        value={localFile}
        onChange={handleFileSelected}
        isRequired={isRequired}
        isDisabled={isDisabled || (fileState?.uploading ?? false)}
      />

      {fileState?.uploading && (
        <div className="mt-2 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Uploading...
        </div>
      )}

      {fileState?.error && (
        <p className="mt-1 text-sm text-red-500">Upload failed: {fileState.error}</p>
      )}
    </div>
  );
}
