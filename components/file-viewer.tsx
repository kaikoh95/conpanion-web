import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  FileIcon,
  FileText,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileArchive,
  FilePenLine,
  File as FileGeneric,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Attachment, AttachmentFileType, formatFileSize } from '@/lib/types/attachment';
import { getAttachmentUrl } from '@/lib/api/attachments';
import { getAttachment } from '@/lib/api/attachments';

interface FileViewerProps {
  attachmentIds?: string[];
  directFileUrls?: Array<{
    url: string;
    type?: AttachmentFileType;
    name?: string;
    size?: number;
    isImage?: boolean;
    isPdf?: boolean;
  }>;
  className?: string;
  viewerType?: 'grid' | 'list';
}

// Map file types to appropriate icons
const fileTypeIcons: Record<AttachmentFileType, React.ReactNode> = {
  image: <FileIcon className="h-6 w-6 text-blue-500" />,
  document: <FileText className="h-6 w-6 text-blue-500" />,
  spreadsheet: <FileSpreadsheet className="h-6 w-6 text-green-500" />,
  presentation: <FilePenLine className="h-6 w-6 text-orange-500" />,
  pdf: <FileText className="h-6 w-6 text-red-500" />,
  video: <FileVideo className="h-6 w-6 text-purple-500" />,
  audio: <FileAudio className="h-6 w-6 text-yellow-500" />,
  archive: <FileArchive className="h-6 w-6 text-gray-500" />,
  text: <FileText className="h-6 w-6 text-teal-500" />,
  other: <FileGeneric className="h-6 w-6 text-gray-400" />,
};

// Function to get the file extension from a path
const getFileExtension = (path: string): string => {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
};

// Function to determine file type from extension or flags
const determineFileType = (file: {
  url: string;
  isImage?: boolean;
  isPdf?: boolean;
}): AttachmentFileType => {
  if (file.isImage) return 'image';
  if (file.isPdf) return 'pdf';

  const ext = getFileExtension(file.url);

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
  if (['doc', 'docx', 'rtf'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'presentation';
  if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['txt', 'md'].includes(ext)) return 'text';

  return 'other';
};

export function FileViewer({
  attachmentIds = [],
  directFileUrls = [],
  className,
  viewerType = 'grid',
}: FileViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<
    Array<{ id: string; url: string; type: AttachmentFileType; name: string; size: number }>
  >([]);
  const [showLightbox, setShowLightbox] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Handle direct file URLs
  useEffect(() => {
    if (directFileUrls && directFileUrls.length > 0) {
      setLoading(true);

      try {
        // Process direct file URLs into the same format as attachment URLs
        const processedUrls = directFileUrls.map((file, index) => {
          const fileType = file.type || determineFileType(file);
          return {
            id: `direct-${index}`,
            url: file.url,
            type: fileType,
            name: file.name || `File ${index + 1}`,
            size: file.size || 0,
          };
        });

        setFileUrls(processedUrls);
      } catch (err: any) {
        console.error('Error processing direct file URLs:', err);
        setError(err.message || 'Failed to process file URLs');
      } finally {
        setLoading(false);
      }
    }
  }, [directFileUrls]);

  // Fetch attachments and their URLs
  useEffect(() => {
    if (attachmentIds.length === 0 || directFileUrls.length > 0) {
      // Skip if we're using direct URLs or no attachment IDs
      if (attachmentIds.length === 0 && directFileUrls.length === 0) {
        setFileUrls([]);
        setLoading(false);
      }
      return;
    }

    const fetchAttachments = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch each attachment's data and URL
        const results = await Promise.all(
          attachmentIds.map(async (id) => {
            // First get the attachment data
            const { data: attachment, error: attachmentError } = await getAttachment(id);

            if (attachmentError || !attachment) {
              console.error(`Error fetching attachment ${id}:`, attachmentError);
              return null;
            }

            // Then get the signed URL
            const { url, error: urlError } = await getAttachmentUrl(id);

            if (urlError || !url) {
              console.error(`Error getting URL for attachment ${id}:`, urlError);
              return null;
            }

            return {
              id,
              url,
              type: attachment.file_type,
              name: attachment.file_name,
              size: attachment.file_size,
            };
          }),
        );

        // Filter out any null values (failed fetches)
        const validData = results.filter(Boolean) as Array<{
          id: string;
          url: string;
          type: AttachmentFileType;
          name: string;
          size: number;
        }>;

        setFileUrls(validData);
      } catch (err: any) {
        console.error('Error loading attachments:', err);
        setError(err.message || 'Failed to load attachments');
      } finally {
        setLoading(false);
      }
    };

    fetchAttachments();
  }, [attachmentIds, directFileUrls.length]);

  const openLightbox = (index: number) => {
    const file = fileUrls[index];
    // Only open lightbox for images, videos and PDFs
    if (['image', 'video', 'pdf'].includes(file.type)) {
      setCurrentFileIndex(index);
      setShowLightbox(true);
    } else {
      // For other file types, open in a new tab
      window.open(file.url, '_blank');
    }
  };

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentFileIndex((prev) => (prev === 0 ? fileUrls.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentFileIndex((prev) => (prev === fileUrls.length - 1 ? 0 : prev + 1));
  };

  if (loading) {
    return viewerType === 'grid' ? (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[...Array(Math.min(attachmentIds.length, 3))].map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {[...Array(Math.min(attachmentIds.length, 3))].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500">Error loading files: {error}</div>;
  }

  if (fileUrls.length === 0) {
    return <div className="text-sm text-muted-foreground">No files available</div>;
  }

  // Render the files in grid view
  const renderGridView = () => (
    <div
      className={cn(
        `grid gap-2 ${fileUrls.length === 1 ? 'grid-cols-1' : fileUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`,
        className,
      )}
    >
      {fileUrls.map((file, index) => (
        <div
          key={file.id}
          className={`relative cursor-pointer overflow-hidden rounded-md border bg-muted ${
            fileUrls.length === 1 ? 'mx-auto aspect-video w-full max-w-md' : 'aspect-square'
          }`}
          onClick={() => openLightbox(index)}
        >
          {file.type === 'image' ? (
            // Image preview
            <>
              <Image
                src={file.url}
                alt={file.name || `File ${index + 1}`}
                fill
                style={{ objectFit: 'cover' }}
                sizes={
                  fileUrls.length === 1
                    ? '(max-width: 768px) 100vw, 450px'
                    : '(max-width: 768px) 50vw, 33vw'
                }
                className="transition-all hover:scale-105"
                onError={(e) => {
                  // Handle image load error
                  const imgElement = e.currentTarget;
                  imgElement.style.display = 'none';
                  const parent = imgElement.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'flex h-full w-full items-center justify-center bg-muted';
                    fallback.innerHTML =
                      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-muted-foreground"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"></path><line x1="13.5" x2="6.5" y1="13.5" y2="20.5"></line><path d="M14 14h-4v-4"></path><path d="M5 15l-2 2"></path><path d="M7 3 21 17"></path><path d="M19 21 3 5"></path></svg>';
                    parent.appendChild(fallback);
                  }
                }}
              />
            </>
          ) : (
            // Non-image file preview with appropriate icon
            <div className="flex h-full w-full flex-col items-center justify-center p-4">
              {fileTypeIcons[file.type]}
              <p className="mt-2 max-w-full truncate text-center text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity hover:bg-black/30 hover:opacity-100">
            <ZoomIn className="h-8 w-8 text-white" />
            {file.type === 'image' && (
              <p className="mt-2 max-w-full truncate px-2 text-center text-sm text-white">
                {file.name}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // Render the files in list view
  const renderListView = () => (
    <div className={cn('space-y-2', className)}>
      {fileUrls.map((file, index) => (
        <div
          key={file.id}
          className="flex cursor-pointer items-center rounded-md p-2 hover:bg-muted"
          onClick={() => openLightbox(index)}
        >
          {fileTypeIcons[file.type]}
          <div className="ml-3 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {viewerType === 'grid' ? renderGridView() : renderListView()}

      {/* Lightbox dialog for images, videos, and PDFs */}
      <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
        <DialogContent className="max-w-screen-lg border-none bg-black/95 p-0 text-white [&>button]:hidden">
          <div className="relative flex h-full min-h-[50vh] w-full items-center justify-center">
            {fileUrls.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={handlePrevious}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={handleNext}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}

            <div className="relative h-[70vh] w-full">
              {fileUrls[currentFileIndex] && (
                <>
                  {fileUrls[currentFileIndex].type === 'image' ? (
                    <Image
                      src={fileUrls[currentFileIndex].url}
                      alt={`Full size image ${currentFileIndex + 1}`}
                      fill
                      style={{ objectFit: 'contain' }}
                      sizes="100vw"
                      priority
                      onError={(e) => {
                        // Show a placeholder when image fails to load
                        const imgElement = e.currentTarget;
                        imgElement.style.display = 'none';
                        const parent = imgElement.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = 'flex h-full w-full items-center justify-center';
                          fallback.innerHTML =
                            '<div class="flex flex-col items-center gap-2 text-center text-white"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-2"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"></path><line x1="13.5" x2="6.5" y1="13.5" y2="20.5"></line><path d="M14 14h-4v-4"></path><path d="M5 15l-2 2"></path><path d="M7 3 21 17"></path><path d="M19 21 3 5"></path></svg><p>Failed to load image</p><p class="text-sm text-gray-400">The image may have been deleted or the server is unavailable</p></div>';
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : fileUrls[currentFileIndex].type === 'pdf' ? (
                    <iframe
                      src={`${fileUrls[currentFileIndex].url}#toolbar=0`}
                      className="h-full w-full"
                      title={`PDF ${currentFileIndex + 1}`}
                    />
                  ) : fileUrls[currentFileIndex].type === 'video' ? (
                    <video
                      src={fileUrls[currentFileIndex].url}
                      controls
                      className="h-full w-full"
                      autoPlay={false}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center">
                      <div className="flex flex-col items-center rounded-md bg-white/10 p-6">
                        {fileTypeIcons[fileUrls[currentFileIndex].type]}
                        <p className="mt-4 text-center">{fileUrls[currentFileIndex].name}</p>
                        <p className="text-sm text-gray-400">
                          {formatFileSize(fileUrls[currentFileIndex].size)}
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() => window.open(fileUrls[currentFileIndex].url, '_blank')}
                        >
                          Open File
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {fileUrls.length > 1 && (
            <div className="flex items-center justify-center gap-1 overflow-auto bg-black/90 px-4 py-2">
              {fileUrls.map((file, index) => (
                <button
                  key={file.id}
                  className={`relative h-16 w-16 overflow-hidden rounded-md border-2 transition-all ${
                    index === currentFileIndex
                      ? 'border-primary'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => setCurrentFileIndex(index)}
                >
                  {file.type === 'image' ? (
                    <Image
                      src={file.url}
                      alt={`Thumbnail ${index + 1}`}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="64px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/30">
                      {fileTypeIcons[file.type]}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
