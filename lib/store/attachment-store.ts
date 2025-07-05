import { create } from 'zustand';
import { UploadedFile } from '@/components/attachments/attachment-uploader';
import { uploadAttachment } from '@/lib/api/attachments';
import { AttachmentType } from '@/lib/types/attachment';

// Define the structure of the attachment store state
export interface AttachmentStoreState {
  // Map of temporary entity IDs to their uploaded files
  pendingAttachments: Record<string, Record<string | number, UploadedFile>>;

  // Add a pending file
  addPendingFile: (tempEntityId: string, itemId: string | number, file: File) => void;

  // Remove a pending file
  removePendingFile: (tempEntityId: string, itemId: string | number) => void;

  // Get all pending files for an entity - returns a stable reference
  getPendingFiles: (tempEntityId: string) => Record<string | number, UploadedFile>;

  // Upload a specific file and get its attachment ID
  uploadFile: (
    projectId: number,
    entityType: AttachmentType,
    entityId: string,
    tempEntityId: string,
    itemId: string | number,
  ) => Promise<string | null>;

  // Upload all pending files for an entity
  uploadAllFiles: (
    projectId: number,
    entityType: AttachmentType,
    entityId: string,
    tempEntityId: string,
  ) => Promise<Record<string | number, string>>;

  // Clear all pending files for an entity
  clearPendingFiles: (tempEntityId: string) => void;

  // Clear all pending files
  clearAll: () => void;
}

type State = {
  pendingAttachments: Record<string, Record<string | number, UploadedFile>>;
  // Cache to store computed values and prevent infinite loops
  entityFilesCache: Record<string, Record<string | number, UploadedFile>>;
};

export const useAttachmentStore = create<
  AttachmentStoreState & { entityFilesCache: Record<string, Record<string | number, UploadedFile>> }
>((set, get) => ({
  pendingAttachments: {},
  // Add a cache to store computed values
  entityFilesCache: {},

  addPendingFile: (tempEntityId: string, itemId: string | number, file: File) => {
    set((state: State) => {
      const entityFiles = state.pendingAttachments[tempEntityId] || {};

      // Create the new state
      const newEntityFiles = {
        ...entityFiles,
        [itemId]: {
          file,
          uploading: false,
        },
      };

      // Update the cache
      const newCache = { ...state.entityFilesCache };
      newCache[tempEntityId] = newEntityFiles;

      return {
        pendingAttachments: {
          ...state.pendingAttachments,
          [tempEntityId]: newEntityFiles,
        },
        entityFilesCache: newCache,
      };
    });
  },

  removePendingFile: (tempEntityId: string, itemId: string | number) => {
    set((state: State) => {
      // Create a copy of the entity files
      const entityFiles = { ...(state.pendingAttachments[tempEntityId] || {}) };

      // Remove the file
      delete entityFiles[itemId];

      // Update the cache
      const newCache = { ...state.entityFilesCache };
      newCache[tempEntityId] = entityFiles;

      return {
        pendingAttachments: {
          ...state.pendingAttachments,
          [tempEntityId]: entityFiles,
        },
        entityFilesCache: newCache,
      };
    });
  },

  getPendingFiles: (tempEntityId: string) => {
    const state = get();

    // Use cached value if available to ensure stable reference
    if (state.entityFilesCache[tempEntityId]) {
      return state.entityFilesCache[tempEntityId];
    }

    // If not cached, compute and cache the value
    const entityFiles = state.pendingAttachments[tempEntityId] || {};

    // Store in cache for future use
    set((state: State) => {
      const newCache = { ...state.entityFilesCache };
      newCache[tempEntityId] = entityFiles;
      return { entityFilesCache: newCache };
    });

    return entityFiles;
  },

  uploadFile: async (
    projectId: number,
    entityType: AttachmentType,
    entityId: string,
    tempEntityId: string,
    itemId: string | number,
  ) => {
    const state = get();
    const entityFiles = state.pendingAttachments[tempEntityId] || {};
    const uploadedFile = entityFiles[itemId];

    if (!uploadedFile) return null;

    // Mark as uploading
    set((state: State) => {
      const updatedFiles = { ...state.pendingAttachments };
      if (updatedFiles[tempEntityId] && updatedFiles[tempEntityId][itemId]) {
        const newEntityFiles = {
          ...updatedFiles[tempEntityId],
          [itemId]: {
            ...updatedFiles[tempEntityId][itemId],
            uploading: true,
            error: undefined,
          },
        };

        updatedFiles[tempEntityId] = newEntityFiles;

        // Update cache
        const newCache = { ...state.entityFilesCache };
        newCache[tempEntityId] = newEntityFiles;

        return {
          pendingAttachments: updatedFiles,
          entityFilesCache: newCache,
        };
      }
      return { pendingAttachments: updatedFiles };
    });

    try {
      const { data, error } = await uploadAttachment({
        projectId: projectId.toString(),
        entityType,
        entityId,
        file: uploadedFile.file,
      });

      if (error) {
        // Update with error
        set((state: State) => {
          const updatedFiles = { ...state.pendingAttachments };
          if (updatedFiles[tempEntityId] && updatedFiles[tempEntityId][itemId]) {
            const newEntityFiles = {
              ...updatedFiles[tempEntityId],
              [itemId]: {
                ...updatedFiles[tempEntityId][itemId],
                uploading: false,
                error: error.message,
              },
            };

            updatedFiles[tempEntityId] = newEntityFiles;

            // Update cache
            const newCache = { ...state.entityFilesCache };
            newCache[tempEntityId] = newEntityFiles;

            return {
              pendingAttachments: updatedFiles,
              entityFilesCache: newCache,
            };
          }
          return { pendingAttachments: updatedFiles };
        });

        return null;
      }

      // Update with success
      set((state: State) => {
        const updatedFiles = { ...state.pendingAttachments };
        if (updatedFiles[tempEntityId] && updatedFiles[tempEntityId][itemId]) {
          const newEntityFiles = {
            ...updatedFiles[tempEntityId],
            [itemId]: {
              ...updatedFiles[tempEntityId][itemId],
              uploading: false,
              id: data!.id,
            },
          };

          updatedFiles[tempEntityId] = newEntityFiles;

          // Update cache
          const newCache = { ...state.entityFilesCache };
          newCache[tempEntityId] = newEntityFiles;

          return {
            pendingAttachments: updatedFiles,
            entityFilesCache: newCache,
          };
        }
        return { pendingAttachments: updatedFiles };
      });

      return data!.id;
    } catch (err: any) {
      // Update with error
      set((state: State) => {
        const updatedFiles = { ...state.pendingAttachments };
        if (updatedFiles[tempEntityId] && updatedFiles[tempEntityId][itemId]) {
          const newEntityFiles = {
            ...updatedFiles[tempEntityId],
            [itemId]: {
              ...updatedFiles[tempEntityId][itemId],
              uploading: false,
              error: err.message,
            },
          };

          updatedFiles[tempEntityId] = newEntityFiles;

          // Update cache
          const newCache = { ...state.entityFilesCache };
          newCache[tempEntityId] = newEntityFiles;

          return {
            pendingAttachments: updatedFiles,
            entityFilesCache: newCache,
          };
        }
        return { pendingAttachments: updatedFiles };
      });

      return null;
    }
  },

  uploadAllFiles: async (
    projectId: number,
    entityType: AttachmentType,
    entityId: string,
    tempEntityId: string,
  ) => {
    const state = get();
    const entityFiles = state.pendingAttachments[tempEntityId] || {};
    const results: Record<string | number, string> = {};

    const itemIds = Object.keys(entityFiles);

    for (const itemId of itemIds) {
      const attachmentId = await get().uploadFile(
        projectId,
        entityType,
        entityId,
        tempEntityId,
        itemId,
      );

      if (attachmentId) {
        results[itemId] = attachmentId;
      }
    }

    return results;
  },

  clearPendingFiles: (tempEntityId: string) => {
    set((state: State) => {
      const newPendingAttachments = { ...state.pendingAttachments };
      delete newPendingAttachments[tempEntityId];

      // Also clear the cache
      const newCache = { ...state.entityFilesCache };
      delete newCache[tempEntityId];

      return {
        pendingAttachments: newPendingAttachments,
        entityFilesCache: newCache,
      };
    });
  },

  clearAll: () => {
    set({ pendingAttachments: {}, entityFilesCache: {} });
  },
}));
