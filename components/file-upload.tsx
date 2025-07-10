import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Upload, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { formatFileSize } from '@/lib/types/attachment';
import Image from 'next/image';

export interface FileUploadProps {
  onChange: (file: File | null) => void;
  value: File | null;
  accept?: string;
  maxSize?: number; // in bytes
  isRequired?: boolean;
  isDisabled?: boolean;
}

export default function FileUpload({
  onChange,
  value,
  accept = 'image/*',
  maxSize = 31457280, // 30MB default
  isRequired = false,
  isDisabled = false,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create a preview URL for the file if it exists
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Update preview when value changes
  useEffect(() => {
    if (value && value.type.startsWith('image/')) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    };
  }, [value]);

  const handleFileChange = (file: File | null) => {
    setError(null);

    if (!file) {
      onChange(null);
      setPreviewUrl(null);
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      setError(`File is too large. Maximum size is ${formatFileSize(maxSize)}.`);
      return;
    }

    // For images, create a preview
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    onChange(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    handleFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!isDisabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const getFileIcon = () => {
    if (!value) return <Upload className="h-8 w-8 text-muted-foreground" />;

    if (value.type.startsWith('image/')) {
      return previewUrl ? (
        <div className="relative h-24 w-24 overflow-hidden rounded-md">
          <Image
            src={previewUrl}
            alt="Preview"
            fill
            style={{ objectFit: 'cover' }}
            className="rounded-md"
          />
        </div>
      ) : (
        <ImageIcon className="h-8 w-8 text-primary" />
      );
    }

    return <FileIcon className="h-8 w-8 text-primary" />;
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={isDisabled}
      />

      <div
        className={`relative flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
        } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          {getFileIcon()}

          {value ? (
            <div className="mt-2 text-center">
              <p className="text-sm font-medium">{value.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(value.size)}</p>
            </div>
          ) : (
            <div className="mt-2 text-center">
              <p className="text-sm font-medium">
                Drag & drop or click to upload{' '}
                {isRequired && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-muted-foreground">Max size: {formatFileSize(maxSize)}</p>
            </div>
          )}
        </div>

        {value && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="absolute right-2 top-2 h-7 w-7 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            disabled={isDisabled}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
