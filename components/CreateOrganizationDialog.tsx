'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useOrganization } from '@/contexts/OrganizationContext';
import { CreateOrganizationRequest } from '@/lib/types/organization';

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const { createOrganization } = useOrganization();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CreateOrganizationRequest>({
    name: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      // Reset to clean state when opening
      setFormData({
        name: '',
        description: '',
      });
      setErrors({});
      setIsLoading(false);
    } else {
      // Ensure clean state when closing with a delay to allow for proper cleanup
      const cleanup = () => {
        setIsLoading(false);
        setErrors({});

        // Force cleanup of any remaining modal artifacts
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';

        // Remove any lingering modal-related classes
        document.body.classList.remove('modal-open');

        // Ensure focus is properly returned
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }

        // Set focus to body
        document.body.focus();

        // Force a reflow to ensure styles are applied
        void document.body.offsetHeight;
      };

      // Use a small delay to ensure the modal has fully closed
      setTimeout(cleanup, 50);
    }
  }, [open]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Ensure cleanup when component unmounts
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    };
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Organization name must be at least 2 characters';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Organization name must be less than 50 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      await createOrganization(formData);

      // Close dialog - form reset will happen automatically via useEffect
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create organization:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'Failed to create organization',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreateOrganizationRequest, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleCancel = () => {
    // Force immediate cleanup before closing
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        // Ensure proper cleanup when dialog closes
        if (!newOpen) {
          // Force immediate cleanup
          document.body.style.pointerEvents = '';
          document.body.style.overflow = '';
        }
        onOpenChange(newOpen);
      }}
    >
      <DialogContent
        className="sm:max-w-[425px]"
        onPointerDownOutside={() => onOpenChange(false)}
        onEscapeKeyDown={() => onOpenChange(false)}
        onInteractOutside={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to collaborate with your team. You'll be the owner of this
            organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              placeholder="Enter organization name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              disabled={isLoading}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter organization description (optional)"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              disabled={isLoading}
              className={errors.description ? 'border-destructive' : ''}
              rows={3}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
          </div>

          {errors.submit && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {errors.submit}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name.trim()}>
              {isLoading ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
