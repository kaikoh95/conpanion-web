import { SiteDiaryResponse, SiteDiaryTemplateItem } from '@/lib/types/site-diary';
import { getAttachments } from '@/lib/api/attachments';
import { FileViewer } from '@/components/file-viewer';
import Image from 'next/image';
import { ZoomIn, FileText } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useState, useEffect } from 'react';

interface SiteDiaryResponsesProps {
  diaryData: SiteDiaryResponse;
  className?: string;
}

// File Answer Viewer Component
interface FileAnswerViewerProps {
  diaryId: number | null;
  itemId: number | undefined;
}

function FileAnswerViewer({ diaryId, itemId }: FileAnswerViewerProps) {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const loadAttachments = async () => {
      if (!diaryId || !itemId) {
        setLoading(false);
        return;
      }

      try {
        const attachmentData = await getAttachments('site_diary', diaryId.toString());

        // Filter attachments for this specific item
        const itemAttachments =
          attachmentData.data?.filter((att: any) => att.metadata?.itemId === itemId.toString()) ||
          [];

        setAttachments(itemAttachments);
      } catch (err) {
        console.error('Error loading attachments:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAttachments();
  }, [diaryId, itemId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading files...</div>;
  }

  if (attachments.length === 0) {
    return <span className="text-muted-foreground">No files uploaded</span>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {attachments.map((attachment) => {
          const isImage = attachment.file_type?.startsWith('image/');

          return (
            <div key={attachment.id} className="group relative">
              {isImage ? (
                <div
                  className="relative aspect-square cursor-pointer overflow-hidden rounded-lg border"
                  onClick={() => setSelectedImage(attachment.file_url)}
                >
                  <Image
                    src={attachment.file_url}
                    alt={attachment.file_name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                    <ZoomIn className="h-6 w-6 text-white" />
                  </div>
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted">
                  <div className="text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-1 text-xs text-muted-foreground">{attachment.file_name}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Image preview dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          {selectedImage && (
            <div className="relative h-[80vh]">
              <Image src={selectedImage} alt="Preview" fill className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SiteDiaryResponses({ diaryData, className = '' }: SiteDiaryResponsesProps) {
  // Helper function to get answer for a specific item
  const getAnswerForItem = (itemId: number | undefined): any => {
    if (!itemId) return null;
    const answer = diaryData.answers.find((a) => a.item_id === itemId);
    return answer?.answer_value;
  };

  // Render answer value based on item type
  const renderAnswerValue = (item: SiteDiaryTemplateItem, answerValue: any) => {
    if (!answerValue) return <span className="text-muted-foreground">No answer provided</span>;

    switch (item.item_type) {
      case 'checklist':
        return (
          <ul className="list-inside list-disc">
            {Array.isArray(answerValue) &&
              answerValue.map((option, index) => <li key={index}>{option}</li>)}
          </ul>
        );

      case 'radio_box':
        return <span>{answerValue}</span>;

      case 'photo':
        return <FileAnswerViewer diaryId={diaryData.diary.id || null} itemId={item.id} />;

      default:
        return <span>{answerValue}</span>;
    }
  };

  if (!diaryData.template_items || diaryData.template_items.length === 0) {
    return (
      <div className={className}>
        <p className="text-muted-foreground">No responses available</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Site Conditions */}
      {diaryData.template?.metadata &&
        (diaryData.template.metadata.enableWeather ||
          diaryData.template.metadata.enableTemperature ||
          diaryData.template.metadata.enableConditions) && (
          <div className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">Site Conditions</h3>
            <div className="space-y-2 rounded-md bg-muted p-4">
              {diaryData.template.metadata.enableWeather && diaryData.diary.metadata?.weather && (
                <div>
                  <span className="font-medium">Weather: </span>
                  <span>{diaryData.diary.metadata.weather}</span>
                </div>
              )}
              {diaryData.template.metadata.enableTemperature &&
                diaryData.diary.metadata?.temperature && (
                  <div>
                    <span className="font-medium">Temperature: </span>
                    <span>{diaryData.diary.metadata.temperature}°C</span>
                  </div>
                )}
              {diaryData.template.metadata.enableConditions &&
                diaryData.diary.metadata?.conditions && (
                  <div>
                    <span className="font-medium">Conditions: </span>
                    <span>{diaryData.diary.metadata.conditions}</span>
                  </div>
                )}
            </div>
          </div>
        )}

      {/* Resources */}
      {diaryData.template?.metadata &&
        (diaryData.template.metadata.enableManpower ||
          diaryData.template.metadata.enableEquipment ||
          diaryData.template.metadata.enableMaterials) && (
          <div className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">Resources</h3>
            <div className="space-y-2 rounded-md bg-muted p-4">
              {diaryData.template.metadata.enableManpower && diaryData.diary.metadata?.manpower && (
                <div>
                  <span className="font-medium">Manpower: </span>
                  <span>{diaryData.diary.metadata.manpower} people</span>
                </div>
              )}
              {diaryData.template.metadata.enableEquipment &&
                diaryData.diary.metadata?.equipment && (
                  <div>
                    <span className="font-medium">Equipment: </span>
                    <span>
                      {Array.isArray(diaryData.diary.metadata.equipment)
                        ? diaryData.diary.metadata.equipment.join(', ')
                        : diaryData.diary.metadata.equipment}
                    </span>
                  </div>
                )}
              {diaryData.template.metadata.enableMaterials &&
                diaryData.diary.metadata?.materials && (
                  <div>
                    <span className="font-medium">Materials: </span>
                    <span>{diaryData.diary.metadata.materials}</span>
                  </div>
                )}
            </div>
          </div>
        )}

      {/* Safety Observations */}
      {diaryData.template?.metadata?.enableSafety && diaryData.diary.metadata?.safety && (
        <div className="mb-6">
          <h3 className="mb-2 text-lg font-semibold">Safety Observations</h3>
          <div className="rounded-md bg-muted p-4">
            <p>{diaryData.diary.metadata.safety}</p>
          </div>
        </div>
      )}

      {/* Template Items/Responses */}
      <div className="mb-6">
        <div className="space-y-4">
          {diaryData.template_items.map((item) => (
            <div key={item.id} className="rounded-md border p-4">
              <p className="mb-2 font-medium">{item.question_value}</p>
              <div className="ml-2">{renderAnswerValue(item, getAnswerForItem(item.id))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
