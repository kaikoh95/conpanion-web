import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Attachment } from '@/lib/types/attachment';
import { getAttachmentUrl } from '@/lib/api/attachments';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogPortal,
  DialogOverlay,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ExternalLink,
  Download,
  ImageOff,
} from 'lucide-react';

interface ImageViewerProps {
  attachmentIds: string[];
}

export function ImageViewer({ attachmentIds }: ImageViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Array<{ id: string; url: string }>>([]);
  const [showLightbox, setShowLightbox] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const fetchImages = async () => {
      setLoading(true);
      setError(null);

      try {
        const urls = await Promise.all(
          attachmentIds.map(async (id) => {
            const { url, error } = await getAttachmentUrl(id);
            if (error) {
              throw error;
            }
            return { id, url: url || '' };
          }),
        );

        setImageUrls(urls.filter((item) => item.url));
      } catch (err: any) {
        console.error('Error loading images:', err);
        setError(err.message || 'Failed to load images');
      } finally {
        setLoading(false);
      }
    };

    if (attachmentIds.length > 0) {
      fetchImages();
    } else {
      setImageUrls([]);
      setLoading(false);
    }
  }, [attachmentIds]);

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setShowLightbox(true);
  };

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1));
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[...Array(attachmentIds.length || 1)].map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500">Error loading images: {error}</div>;
  }

  if (imageUrls.length === 0) {
    return <div className="text-sm text-muted-foreground">No images available</div>;
  }

  return (
    <>
      <div
        className={`grid gap-2 ${imageUrls.length === 1 ? 'grid-cols-1' : imageUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}
      >
        {imageUrls.map((image, index) => (
          <div
            key={image.id}
            className={`relative cursor-pointer overflow-hidden rounded-md border bg-muted ${
              imageUrls.length === 1 ? 'mx-auto aspect-video w-full max-w-md' : 'aspect-square'
            }`}
            onClick={() => openLightbox(index)}
          >
            <Image
              src={image.url}
              alt={`Attachment ${index + 1}`}
              fill
              style={{ objectFit: 'cover' }}
              sizes={
                imageUrls.length === 1
                  ? '(max-width: 768px) 100vw, 450px'
                  : '(max-width: 768px) 50vw, 33vw'
              }
              className="transition-all hover:scale-105"
              onError={(e) => {
                // Show a placeholder when image fails to load
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
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:bg-black/30 hover:opacity-100">
              <ZoomIn className="h-8 w-8 text-white" />
            </div>
          </div>
        ))}
      </div>

      {/* Image lightbox dialog */}
      <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
        <DialogContent className="max-w-screen-lg border-none bg-black/95 p-0 text-white [&>button]:hidden">
          {/* Hide the default close button with the [&>button]:hidden class */}
          <div className="relative flex h-full min-h-[50vh] w-full items-center justify-center">
            {imageUrls.length > 1 && (
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
              {imageUrls[currentImageIndex] && (
                <Image
                  src={imageUrls[currentImageIndex].url}
                  alt={`Full size image ${currentImageIndex + 1}`}
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
              )}
            </div>

            <div className="absolute bottom-4 right-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-black/50 text-white hover:bg-black/70"
                asChild
              >
                <a
                  href={imageUrls[currentImageIndex]?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-black/50 text-white hover:bg-black/70"
                asChild
              >
                <a href={imageUrls[currentImageIndex]?.url} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            </div>

            <DialogClose className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>

          {imageUrls.length > 1 && (
            <div className="flex items-center justify-center gap-1 overflow-auto bg-black/90 px-4 py-2">
              {imageUrls.map((image, index) => (
                <button
                  key={image.id}
                  className={`relative h-16 w-16 overflow-hidden rounded-md border-2 transition-all ${
                    index === currentImageIndex
                      ? 'border-primary'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => setCurrentImageIndex(index)}
                >
                  <Image
                    src={image.url}
                    alt={`Thumbnail ${index + 1}`}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="64px"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
