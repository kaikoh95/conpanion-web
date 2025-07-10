import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Button } from './ui/button';
import { X, FileIcon, ImageIcon, Upload } from 'lucide-react';
import { formatFileSize } from '@/lib/types/attachment';
import { toast } from 'sonner';
import Image from 'next/image';
import { useProject } from '@/contexts/ProjectContext';

interface TaskFileUploaderProps {
  taskId: number;
  onUploadChange: (files: File[] | null) => void;
  value?: File[] | null;
  hasError?: boolean;
  errorMessage?: string;
  isDisabled?: boolean;
  maxFiles?: number;
  acceptedFileTypes?: string; // MIME types string for the file input accept attribute
}

interface FileState {
  file: File;
  previewUrl?: string;
}

export default function TaskFileUploader({
  taskId,
  onUploadChange,
  value = null,
  hasError = false,
  errorMessage = 'This field is required',
  isDisabled = false,
  maxFiles = 10,
  acceptedFileTypes = '*',
}: TaskFileUploaderProps) {
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

    // Check if we've reached the maximum number of files
    if (files.length >= maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed.`);
      return;
    }

    console.log('Adding file to task:', taskId, 'in project:', currentProject.id);

    // Add file to local state with preview if it's an image
    const newFile: FileState = {
      file,
      previewUrl: createPreviewUrl(file),
    };

    // Update local state
    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);

    // Pass the raw files up to the parent component
    onUploadChange(updatedFiles.map((f) => f.file));
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
    onUploadChange(updatedFiles.length > 0 ? updatedFiles.map((f) => f.file) : null);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    // Handle multiple files
    const availableSlots = maxFiles - files.length;
    const filesToAdd = Array.from(selectedFiles).slice(0, availableSlots);

    if (filesToAdd.length < selectedFiles.length) {
      toast.warning(`Only ${availableSlots} more files can be added. Some files were skipped.`);
    }

    filesToAdd.forEach((file) => handleFileAdd(file));
    e.target.value = ''; // Reset input to allow selecting same file again
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
      const droppedFiles = Array.from(e.dataTransfer.files);
      const availableSlots = maxFiles - files.length;

      // Only process up to the max allowed number of files
      const filesToAdd = droppedFiles.slice(0, availableSlots);

      if (filesToAdd.length < droppedFiles.length) {
        toast.warning(`Only ${availableSlots} more files can be added. Some files were skipped.`);
      }

      filesToAdd.forEach((file) => handleFileAdd(file));
    }
  };

  // Function to get appropriate icon for a file
  const getFileIcon = (file: File) => {
    const type = file.type;

    if (type.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5 text-primary" />;
    } else if (type.startsWith('video/')) {
      return <FileIcon className="h-5 w-5 text-purple-500" />;
    } else if (type.startsWith('audio/')) {
      return <FileIcon className="h-5 w-5 text-yellow-500" />;
    } else if (type === 'application/pdf') {
      return <FileIcon className="h-5 w-5 text-red-500" />;
    } else if (
      type.includes('spreadsheet') ||
      type.includes('excel') ||
      file.name.endsWith('.csv')
    ) {
      return <FileIcon className="h-5 w-5 text-green-500" />;
    } else if (type.includes('document') || type.includes('word')) {
      return <FileIcon className="h-5 w-5 text-blue-500" />;
    } else if (type.includes('presentation') || type.includes('powerpoint')) {
      return <FileIcon className="h-5 w-5 text-orange-500" />;
    }

    return <FileIcon className="h-5 w-5 text-primary" />;
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
          ) : (
            getFileIcon(file)
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
          accept={acceptedFileTypes}
          className="hidden"
          onChange={handleInputChange}
          disabled={isDisabled}
          multiple
        />

        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="mt-2 text-center">
            <p className="text-sm font-medium">Drag & drop or click to upload files</p>
            <p className="text-xs text-muted-foreground">
              Max size: {formatFileSize(maxSize)} (up to {maxFiles} files)
            </p>
          </div>
        </div>
      </div>

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {hasError && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
