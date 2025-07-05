import React, { useState, useEffect } from 'react';
import { Attachment } from '@/lib/types/attachment';
import { getTaskAttachments } from '@/lib/api/task-attachments';
import { Skeleton } from './ui/skeleton';
import { FileViewer } from './file-viewer';
import { cn } from '@/lib/utils';

interface TaskAttachmentsViewerProps {
  taskId: number;
  className?: string;
}

export function TaskAttachmentsViewer({ taskId, className }: TaskAttachmentsViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  // Fetch task attachments
  useEffect(() => {
    const fetchAttachments = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await getTaskAttachments(taskId);

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          // Get the IDs of all attachments
          setAttachmentIds(data.map((attachment) => attachment.id));
        } else {
          setAttachmentIds([]);
        }
      } catch (err: any) {
        console.error('Error loading task attachments:', err);
        setError(err.message || 'Failed to load attachments');
      } finally {
        setLoading(false);
      }
    };

    if (taskId) {
      fetchAttachments();
    }
  }, [taskId]);

  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-3', className)}>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500">Error loading attachments: {error}</div>;
  }

  if (attachmentIds.length === 0) {
    return <div className="text-sm text-muted-foreground">No files attached to this task</div>;
  }

  return <FileViewer attachmentIds={attachmentIds} className={className} />;
}
