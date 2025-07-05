import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from './ui/button';
import { X, FileIcon, ImageIcon, Upload } from 'lucide-react';
import { formatFileSize } from '@/lib/types/attachment';
import { toast } from 'sonner';
import Image from 'next/image';
import { useProject } from '@/contexts/ProjectContext';
import { SiteDiaryTemplateItem } from '@/lib/types/site-diary';

interface SiteDiaryPhotoUploaderProps {
  item: SiteDiaryTemplateItem;
  tempEntityId: string;
  onUploadChange: (itemId: number, value: File[] | null) => void;
  value?: File[] | null;
  hasError?: boolean;
  errorMessage?: string;
  isDisabled?: boolean;
}

interface FileState {
  file: File;
  previewUrl?: string;
}

export default function SiteDiaryPhotoUploader({
  item,
  tempEntityId,
  onUploadChange,
  value = null,
  hasError = false,
  errorMessage = 'This field is required',
  isDisabled = false,
}: SiteDiaryPhotoUploaderProps) {
  const itemId = item.id!;
  const maxSize = 31457280; // 30MB default
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Use local state to store files
  const [files, setFiles] = useState<FileState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Get the current project from context
  const { current: currentProject } = useProject();

  const validateFile = (file: File): boolean => {
    setError(null);

    if (file.size > maxSize) {
      setError(`File is too large. Maximum size is ${formatFileSize(maxSize)}.`);
      return false;
    }

    return true;
  };

  const createPreviewUrl = (file: File): string | undefined => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return undefined;
  };

  const handleFileAdd = (file: File | null) => {
    if (!file) return;

    if (!validateFile(file)) {
      return;
    }

    // Make sure we have a current project
    if (!currentProject?.id) {
      console.error('No project selected for file upload');
      toast.error('No project selected. Please select a project to upload files.');
      return;
    }

    console.log('Adding file to project:', currentProject.id);

    // Add file to local state with preview if it's an image
    const newFile: FileState = {
      file,
      previewUrl: createPreviewUrl(file),
    };

    // Update local state
    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);

    // Pass the raw files up to the parent component
    onUploadChange(
      itemId,
      updatedFiles.map((f) => f.file),
    );
  };

  const handleFileRemove = (index: number) => {
    // Revoke preview URL if it exists
    if (files[index].previewUrl) {
      URL.revokeObjectURL(files[index].previewUrl);
    }

    // Remove file from local state
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);

    // Update parent component
    onUploadChange(itemId, updatedFiles.length > 0 ? updatedFiles.map((f) => f.file) : null);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      handleFileAdd(file);
      e.target.value = ''; // Reset input to allow selecting same file again
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (isDisabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileAdd(e.dataTransfer.files[0]);
    }
  };

  const renderFilePreview = (fileState: FileState, index: number) => {
    const file = fileState.file;
    const isImage = file.type.startsWith('image/');

    return (
      <div key={index} className="relative flex items-center rounded-md border p-2">
        <div className="mr-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-muted">
          {isImage && fileState.previewUrl ? (
            <div className="relative h-full w-full">
              <Image
                src={fileState.previewUrl}
                alt="Preview"
                fill
                style={{ objectFit: 'cover' }}
                className="rounded-md"
              />
            </div>
          ) : isImage ? (
            <ImageIcon className="h-5 w-5 text-primary" />
          ) : (
            <FileIcon className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="ml-2 h-7 w-7 rounded-full"
          onClick={() => handleFileRemove(index)}
          disabled={isDisabled}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Display existing files */}
      {files.length > 0 && (
        <div className="mb-3 space-y-2">
          {files.map((file, index) => renderFilePreview(file, index))}
        </div>
      )}

      {/* File upload area */}
      <div
        className={`relative flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/20 hover:border-primary/50'
        } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
        onClick={() => {
          if (!isDisabled && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
          disabled={isDisabled}
        />

        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="mt-2 text-center">
            <p className="text-sm font-medium">
              Drag & drop or click to upload{' '}
              {item.is_required && <span className="text-red-500">*</span>}
            </p>
            <p className="text-xs text-muted-foreground">Max size: {formatFileSize(maxSize)}</p>
          </div>
        </div>
      </div>

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {hasError && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
