'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, ArrowLeft, Check, Pencil } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
// Import types and fetch function from the API modules
import { fetchFormEntriesWithStatus, FormEntry, ApprovalStatus } from '@/lib/api/entries';
import { getFormEntryById, updateFormEntry } from '@/lib/api/form-entries';
import { FormEntryResponse, FormEntryAnswer } from '@/lib/types/form-entry';
import { getFormById } from '@/lib/api/forms';
import { FormItem } from '@/lib/types/form';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
// Add imports for AlertDialog components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApprovalStatusAccordian } from '@/components/approval-status-accordian';
import { submitApproval } from '@/lib/api/approvals';
import { EntryResponsesAccordion } from '@/components/entry-responses-accordion';

// Get these from the actual enum or configuration (or potentially move to a shared constants file)
const APPROVAL_STATUSES: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'revision_requested', label: 'Revision Requested' },
];

const DEFAULT_STATUS_FILTERS: ApprovalStatus[] = ['draft', 'revision_requested'];

// SearchParamsWrapper component to handle the useSearchParams hook
function SearchParamsWrapper() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entryId');

  return <EntriesPageContent entryId={entryId} />;
}

// Main component content without direct useSearchParams usage
function EntriesPageContent({ entryId }: { entryId: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();
  const [allEntries, setAllEntries] = useState<FormEntry[]>([]); // Store all fetched entries
  const [filteredEntries, setFilteredEntries] = useState<FormEntry[]>([]); // Entries displayed after filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ApprovalStatus | 'all'>('all');

  // State for entry detail view
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [entryDetail, setEntryDetail] = useState<FormEntryResponse | null>(null);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submittedByName, setSubmittedByName] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [formName, setFormName] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);

  // Add a state variable to store user email mappings
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedAnswers, setEditedAnswers] = useState<Record<number, any>>({});
  const [editedEntryName, setEditedEntryName] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Add state for dialog and change tracking
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Add state for submitting approval
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set initial entryId from URL
  useEffect(() => {
    if (entryId) {
      const id = parseInt(entryId);
      if (!isNaN(id)) {
        setSelectedEntryId(id);
      }
    }
  }, [entryId]);

  // Effect to fetch data initially
  useEffect(() => {
    const loadEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedEntries = await fetchFormEntriesWithStatus(supabase);
        console.log('Fetched Entries:', fetchedEntries); // Log fetched data before filtering
        setAllEntries(fetchedEntries);
        // Apply initial filters immediately after fetching
        setFilteredEntries(filterEntries(fetchedEntries, searchTerm, selectedStatus));
      } catch (err: any) {
        console.error('Error loading entries:', err);
        setError(err.message || 'Failed to load entries');
        setAllEntries([]);
        setFilteredEntries([]);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();

    // Add event listener for approval creation
    const handleApprovalCreated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ entryId: number }>;

      // Fetch fresh data
      const fetchedEntries = await fetchFormEntriesWithStatus(supabase);
      setAllEntries(fetchedEntries);
      setFilteredEntries(filterEntries(fetchedEntries, searchTerm, selectedStatus));
    };

    // Add event listener for approval updates
    const handleApprovalUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ entityId: number; entityType: string }>;

      // Fetch fresh data
      const fetchedEntries = await fetchFormEntriesWithStatus(supabase);
      setAllEntries(fetchedEntries);
      setFilteredEntries(filterEntries(fetchedEntries, searchTerm, selectedStatus));

      // If the updated entry is the one we're currently viewing, also refresh the detail view
      if (selectedEntryId === customEvent.detail.entityId) {
        const entryWithStatus = fetchedEntries.find((entry) => entry.id === selectedEntryId);
        if (entryWithStatus) {
          setApprovalStatus(entryWithStatus.approval_status);
        }
      }
    };

    // Add the event listeners
    window.addEventListener('approvalCreated', handleApprovalCreated);
    window.addEventListener('approvalUpdated', handleApprovalUpdated);

    // Cleanup
    return () => {
      window.removeEventListener('approvalCreated', handleApprovalCreated);
      window.removeEventListener('approvalUpdated', handleApprovalUpdated);
    };
  }, [supabase, searchTerm, selectedStatus, selectedEntryId]); // Add selectedEntryId to dependencies

  // Effect to apply filters whenever search term or status changes
  useEffect(() => {
    setFilteredEntries(filterEntries(allEntries, searchTerm, selectedStatus));
  }, [allEntries, searchTerm, selectedStatus]);

  // Effect to fetch user emails when entries are loaded
  useEffect(() => {
    const fetchUserEmails = async () => {
      if (allEntries.length === 0) return;

      // Get unique user IDs from all entries - convert to Array for safer iteration
      const userIds = Array.from(new Set(allEntries.map((entry) => entry.submitted_by_user_id)));

      if (userIds.length === 0) return;

      try {
        const supabaseClient = getSupabaseClient();
        const { data, error } = await supabaseClient.rpc('get_user_details', {
          user_ids: userIds,
        });

        if (error) {
          console.error('Error fetching user details:', error);
          return;
        }

        if (data) {
          // Create a mapping of user IDs to emails
          const emailMap: Record<string, string> = {};
          data.forEach((user: { id: string; raw_user_meta_data: any }) => {
            // Handle type safety by checking structure
            const rawMeta = user.raw_user_meta_data as { email?: string } | null;
            const email = rawMeta?.email || 'Unknown';
            emailMap[user.id] = email;
          });
          setUserEmails(emailMap);
        }
      } catch (err) {
        console.error('Error in fetchUserEmails:', err);
      }
    };

    fetchUserEmails();
  }, [allEntries]);

  // Effect to load entry details when an entry is selected
  useEffect(() => {
    if (selectedEntryId === null) {
      setEntryDetail(null);
      setFormItems([]);
      setSubmittedByName(null);
      setFormName(null);
      setApprovalStatus(null);
      setIsEditMode(false);
      setEditedAnswers({});
      setEditedEntryName('');
      setFormErrors({});
      return;
    }

    const loadEntryDetail = async () => {
      setLoadingDetail(true);
      try {
        // Fetch entry details
        const entryData = await getFormEntryById(selectedEntryId);
        setEntryDetail(entryData);

        if (entryData) {
          // Initialize edit data when entry is loaded
          setEditedEntryName(entryData.entry.name || '');

          // Create a map of item_id -> answer_value for editing
          const answersMap: Record<number, any> = {};
          entryData.answers.forEach((answer: FormEntryAnswer) => {
            answersMap[answer.item_id] = answer.answer_value;
          });
          setEditedAnswers(answersMap);

          // Find approval status from allEntries
          const entryWithStatus = allEntries.find((entry) => entry.id === selectedEntryId);
          if (entryWithStatus) {
            setApprovalStatus(entryWithStatus.approval_status);
          }

          // Fetch form to get questions/items
          const formData = await getFormById(entryData.entry.form_id);
          if (formData) {
            setFormItems(formData.items);
            setFormName(formData.form.name);
          }

          // Fetch user name who submitted the entry
          const supabaseClient = getSupabaseClient();
          const { data: userData, error } = await supabaseClient.rpc('get_user_details', {
            user_ids: [entryData.entry.submitted_by_user_id],
          });

          if (error) {
            console.error('Error fetching user details:', error);
            setSubmittedByName('Unknown User');
          } else if (userData && userData.length > 0) {
            const rawMeta = userData[0].raw_user_meta_data as { email?: string } | null;
            const email = rawMeta?.email || 'Unknown';
            setSubmittedByName(email);
          } else {
            setSubmittedByName('Unknown User');
          }
        }
      } catch (err) {
        console.error('Error loading entry detail:', err);
        toast.error('Failed to load entry details');
      } finally {
        setLoadingDetail(false);
      }
    };

    loadEntryDetail();
  }, [selectedEntryId, allEntries]);

  // Helper function to apply filters
  const filterEntries = (
    entriesToFilter: FormEntry[],
    currentSearchTerm: string,
    currentSelectedStatus: ApprovalStatus | 'all',
  ): FormEntry[] => {
    let result = entriesToFilter;

    // Apply status filter ONLY if a specific status (not 'all') is selected
    if (currentSelectedStatus !== 'all') {
      result = result.filter((entry) => entry.approval_status === currentSelectedStatus);
    }
    // If 'all' is selected, we proceed without applying any status filter.

    // Apply search term filter (applied after status filter or if no status filter)
    if (currentSearchTerm) {
      // Trim and lowercase the search term for robust matching
      const trimmedSearch = currentSearchTerm.trim().toLowerCase();
      if (trimmedSearch) {
        // Only filter if search term is not just whitespace
        result = result.filter(
          (entry) =>
            // Check form name (case-insensitive)
            entry.form_name.toLowerCase().includes(trimmedSearch) ||
            // Check entry ID (as string, case-insensitive)
            entry.id.toString().toLowerCase().includes(trimmedSearch) ||
            // Check NEW entry name (case-insensitive, handle null)
            (entry.name && entry.name.toLowerCase().includes(trimmedSearch)),
        );
      }
    }

    return result;
  };

  // Helper function to get user email by ID
  const getUserEmail = (userId: string): string => {
    if (!userId) return 'N/A';
    return userEmails[userId] || `${userId.substring(0, 8)}...`;
  };

  // Functions to handle editing
  const handleEditToggle = () => {
    if (isEditMode) {
      // Trying to exit edit mode - validate first
      if (hasUnsavedChanges) {
        // Show confirmation dialog for unsaved changes
        setShowDiscardDialog(true);
        return;
      }
      // No changes, safe to exit
      setIsEditMode(false);
    } else {
      // Entering edit mode
      setIsEditMode(true);
      // Reset form errors when entering edit mode
      setFormErrors({});
    }
  };

  const handleAnswerChange = (itemId: number, value: any) => {
    setEditedAnswers((prev) => ({
      ...prev,
      [itemId]: value,
    }));
    setHasUnsavedChanges(true);

    // Clear error for this field if it exists
    if (formErrors[itemId]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[itemId];
        return newErrors;
      });
    }
  };

  const handleEntryNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedEntryName(e.target.value);
    setHasUnsavedChanges(true);
  };

  const validateForm = () => {
    const newErrors: Record<number, string> = {};
    let hasErrors = false;

    // Check for entry name
    if (!editedEntryName.trim()) {
      toast.error('Please provide an entry name');
      return false;
    }

    // Check for required fields
    if (formItems.length > 0) {
      formItems.forEach((item) => {
        if (item.is_required) {
          const answer = editedAnswers[item.id!];
          let isValid = true;

          switch (item.item_type) {
            case 'question':
              // Text input - should be non-empty string
              isValid = !!answer && answer.toString().trim() !== '';
              break;

            case 'radio_box':
              // Single selection - should have a value
              isValid = !!answer && answer.toString().trim() !== '';
              break;

            case 'checklist':
              // Multiple selection - should have at least one item
              isValid = Array.isArray(answer) && answer.length > 0;
              break;

            case 'photo':
              // Photo upload - we'll skip validation for now as it's not fully implemented
              isValid = true;
              break;

            default:
              isValid = !!answer && answer.toString().trim() !== '';
          }

          if (!isValid) {
            newErrors[item.id!] = 'This field is required';
            hasErrors = true;
          }
        }
      });
    }

    setFormErrors(newErrors);
    if (hasErrors) {
      toast.error('Please fill all required fields', {
        description: 'Required fields are marked with an asterisk (*)',
      });
    }
    return !hasErrors;
  };

  const handleSaveChanges = async () => {
    if (!entryDetail || !user || !entryDetail.entry.id) return;

    if (!validateForm()) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      setIsSaving(true);

      // Update the entry name - add non-null assertion to id
      await updateFormEntry(entryDetail.entry.id, {
        name: editedEntryName,
        form_id: entryDetail.entry.form_id,
        submitted_by_user_id: entryDetail.entry.submitted_by_user_id,
      });

      // Update each answer with new value
      const supabase = getSupabaseClient();

      // First delete existing answers
      const { error: deleteError } = await supabase
        .from('form_entry_answers')
        .delete()
        .eq('entry_id', entryDetail.entry.id);

      if (deleteError) {
        throw deleteError;
      }

      // Then insert new answers - fix the type by ensuring non-null values
      const newAnswers = Object.entries(editedAnswers).map(([itemId, value]) => ({
        entry_id: entryDetail.entry.id as number, // Add type assertion
        item_id: parseInt(itemId),
        answer_value: value,
      }));

      if (newAnswers.length > 0) {
        const { error: insertError } = await supabase.from('form_entry_answers').insert(newAnswers);

        if (insertError) {
          throw insertError;
        }
      }

      toast.success('Entry updated successfully');

      // Refresh the entry details and exit edit mode
      setIsEditMode(false);
      setHasUnsavedChanges(false);

      // Reload all entries to get updated data
      const fetchedEntries = await fetchFormEntriesWithStatus(supabase);
      setAllEntries(fetchedEntries);
      setFilteredEntries(filterEntries(fetchedEntries, searchTerm, selectedStatus));

      // Reload the specific entry
      const updatedEntry = await getFormEntryById(entryDetail.entry.id);
      setEntryDetail(updatedEntry);

      // Update the answers map
      const answersMap: Record<number, any> = {};
      updatedEntry?.answers.forEach((answer: FormEntryAnswer) => {
        answersMap[answer.item_id] = answer.answer_value;
      });
      setEditedAnswers(answersMap);
    } catch (error) {
      console.error('Error updating entry:', error);
      toast.error('Failed to update entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
    } else {
      // No changes, safe to cancel without confirmation
      resetEditValues();
      setIsEditMode(false);
    }
  };

  // Add a helper function to reset edit values
  const resetEditValues = () => {
    // Reset edited values to original values
    if (entryDetail) {
      setEditedEntryName(entryDetail.entry.name || '');
      const answersMap: Record<number, any> = {};
      entryDetail.answers.forEach((answer: FormEntryAnswer) => {
        answersMap[answer.item_id] = answer.answer_value;
      });
      setEditedAnswers(answersMap);
    }
    setFormErrors({});
    setHasUnsavedChanges(false);
  };

  // Handler for search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Handler for status select change
  const handleStatusChange = (value: string) => {
    setSelectedStatus(value as ApprovalStatus | 'all');
  };

  // Handler for viewing an entry
  const handleViewEntry = (entryId: number) => {
    setSelectedEntryId(entryId);
    setIsClosing(false);
  };

  // Handler for closing the entry detail panel
  const handleCloseDetail = () => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedEntryId(null);
    }, 300);
  };

  // Add handler for Sheet's onOpenChange
  const handleSheetOpenChange = (isOpen: boolean) => {
    if (isOpen === false && isEditMode && hasUnsavedChanges) {
      // Prevent closing and show confirmation dialog
      setShowDiscardDialog(true);
    } else {
      // No unsaved changes or not in edit mode, proceed with closing
      handleCloseDetail();
    }
  };

  // Helper to render the answer value based on the question type
  const renderAnswer = (item: FormItem, answer: any) => {
    // Handle case when answer is an object
    const getDisplayValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        // If it has a value property, use that
        if ('value' in value) return String(value.value);
        // Otherwise try to convert to string representation
        return JSON.stringify(value);
      }
      return String(value);
    };

    switch (item.item_type) {
      case 'checklist':
        if (Array.isArray(answer) && item.options) {
          return (
            <div className="flex flex-col gap-2 text-sm">
              {item.options.map((option, index) => {
                // Handle case when the answer items might be objects
                let answerValues = answer.map((a: any) =>
                  typeof a === 'object' && a !== null
                    ? a.value !== undefined
                      ? a.value
                      : JSON.stringify(a)
                    : a,
                );

                const isSelected = answerValues.includes(option);
                return (
                  <div key={index} className="flex items-center gap-2 text-foreground">
                    <div className="flex h-4 w-4 items-center justify-center rounded border">
                      {isSelected && <Check className="h-3 w-3 text-primary" />}
                    </div>
                    <span>{option}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        return <span className="text-foreground">{getDisplayValue(answer)}</span>;

      case 'radio_box':
        return <span className="text-foreground">{getDisplayValue(answer)}</span>;

      case 'photo':
        return <p>Photo preview not available</p>;

      default:
        return <span className="text-foreground">{getDisplayValue(answer)}</span>;
    }
  };

  // Function to render editable form items
  const renderFormItem = (item: FormItem) => {
    const itemId = item.id!;
    const hasError = !!formErrors[itemId];

    switch (item.item_type) {
      case 'question':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <Input
              id={`question-${itemId}`}
              value={editedAnswers[itemId] || ''}
              onChange={(e) => handleAnswerChange(itemId, e.target.value)}
              className={hasError ? 'border-red-500' : ''}
              aria-invalid={hasError}
              aria-describedby={hasError ? `error-${itemId}` : undefined}
            />
            {hasError && (
              <p id={`error-${itemId}`} className="text-sm font-medium text-red-500">
                {formErrors[itemId]}
              </p>
            )}
          </div>
        );

      case 'radio_box':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <Select
              value={editedAnswers[itemId] || ''}
              onValueChange={(value) => handleAnswerChange(itemId, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {item.options?.map((option, index) => (
                  <SelectItem key={index} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      case 'checklist':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <div className="space-y-2">
              {item.options?.map((option, index) => {
                // Handle when editedAnswers[itemId] might be undefined
                const currentValues = editedAnswers[itemId] || [];
                // Handle different answer value formats
                const answerValues = Array.isArray(currentValues)
                  ? currentValues.map((a: any) =>
                      typeof a === 'object' && a !== null
                        ? a.value !== undefined
                          ? a.value
                          : JSON.stringify(a)
                        : a,
                    )
                  : [];

                return (
                  <div key={index} className="flex items-center space-x-2">
                    <Checkbox
                      id={`checkbox-${itemId}-${index}`}
                      checked={answerValues.includes(option)}
                      onCheckedChange={(checked) => {
                        const newValues = checked
                          ? [...answerValues, option]
                          : answerValues.filter((v: string) => v !== option);
                        handleAnswerChange(itemId, newValues);
                      }}
                    />
                    <Label htmlFor={`checkbox-${itemId}-${index}`}>{option}</Label>
                  </div>
                );
              })}
            </div>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      case 'photo':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <div className="rounded-md border-2 border-dashed border-muted p-6 text-center">
              <p className="text-muted-foreground">Photo upload (coming soon)</p>
            </div>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  // Update handleDiscardChanges to use reset function
  const handleDiscardChanges = () => {
    resetEditValues();
    setIsEditMode(false);
    setShowDiscardDialog(false);
    handleCloseDetail();
  };

  // Add function to check if we can exit edit mode
  const checkCanExitEditMode = (): boolean => {
    if (!hasUnsavedChanges) return true;

    // Only validate if there are unsaved changes
    return validateForm();
  };

  const handleSubmitApproval = async () => {
    if (!entryDetail || !approvalStatus) return;

    try {
      setIsSubmitting(true);

      // Get the approval ID from the entry detail
      const { data: approvalData, error: approvalError } = await supabase
        .from('approvals')
        .select('id')
        .eq('entity_type', 'entries')
        .eq('entity_id', entryDetail.entry.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvalError) {
        console.error('Error fetching approval:', approvalError);
        throw new Error('Failed to fetch approval details');
      }

      if (!approvalData) {
        throw new Error('No approval found for this entry');
      }

      try {
        // Submit the approval
        await submitApproval(approvalData.id);

        toast.success('Approval submitted successfully');

        // Refresh the entries list to update the status
        const fetchedEntries = await fetchFormEntriesWithStatus(supabase);
        setAllEntries(fetchedEntries);
        setFilteredEntries(filterEntries(fetchedEntries, searchTerm, selectedStatus));

        // Update the approval status in the detail view
        const entryWithStatus = fetchedEntries.find((entry) => entry.id === entryDetail.entry.id);
        if (entryWithStatus) {
          setApprovalStatus(entryWithStatus.approval_status);
        }
      } catch (submitError) {
        console.error('Error in submitApproval:', submitError);
        if (submitError instanceof Error) {
          throw submitError;
        } else {
          throw new Error('Failed to submit approval. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error submitting approval:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container space-y-6 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Entries</h1>

      {/* Search and Filters */}
      <div className="mb-4 flex flex-col items-center gap-4 md:flex-row">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by form name or entry ID..."
            className="w-full pl-10"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <Select value={selectedStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {APPROVAL_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entries Table */}
      <div className="rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry Name</TableHead>
              <TableHead>Form Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted Date</TableHead>
              <TableHead>Submitted By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => (
                <TableRow
                  key={entry.id}
                  onClick={() => handleViewEntry(entry.id)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-medium">{entry.name || 'N/A'}</TableCell>
                  <TableCell>{entry.form_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        entry.approval_status === 'approved'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : entry.approval_status === 'declined'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : entry.approval_status === 'submitted'
                              ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                              : entry.approval_status === 'revision_requested'
                                ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                : ''
                      }
                    >
                      {entry.approval_status || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.created_at ? format(new Date(entry.created_at), 'PPP') : 'N/A'}
                  </TableCell>
                  <TableCell>{getUserEmail(entry.submitted_by_user_id)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No entries found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Entry Detail Side Panel */}
      <Sheet open={selectedEntryId !== null} onOpenChange={handleSheetOpenChange}>
        <SheetTitle />
        <SheetContent
          className={`h-full w-full border-l p-0 transition-transform duration-300 focus:outline-none focus-visible:outline-none md:w-[40vw] md:max-w-[40vw] [&>button]:hidden ${
            isClosing ? 'translate-x-full' : 'translate-x-0'
          }`}
          side="right"
        >
          {loadingDetail ? (
            <div className="flex h-full flex-col">
              <div className="border-b p-6">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex-1 overflow-auto">
                <div className="space-y-6 p-6">
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : !entryDetail ? (
            <div className="flex h-full items-center justify-center">
              <p>Entry not found</p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b p-6">
                <div className="flex items-start gap-4">
                  <Button variant="ghost" size="icon" onClick={handleCloseDetail}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1">
                    {isEditMode ? (
                      <div className="mb-4">
                        <Label
                          htmlFor="edit-entry-name"
                          className="mb-2 block text-base font-semibold"
                        >
                          Entry Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="edit-entry-name"
                          value={editedEntryName}
                          onChange={handleEntryNameChange}
                          className="w-full"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 flex items-center gap-2">
                          <h2 className="text-2xl font-semibold">{entryDetail.entry.name}</h2>
                          {approvalStatus && (
                            <Badge
                              variant="outline"
                              className={
                                approvalStatus === 'approved'
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : approvalStatus === 'declined'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : approvalStatus === 'submitted'
                                      ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                      : approvalStatus === 'revision_requested'
                                        ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                        : ''
                              }
                            >
                              {approvalStatus}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {formName && (
                            <p className="text-sm text-muted-foreground">Form: {formName}</p>
                          )}
                          <p className="text-sm text-muted-foreground">
                            Created by: {submittedByName || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Date:{' '}
                            {entryDetail.entry.created_at
                              ? format(new Date(entryDetail.entry.created_at), 'PPP')
                              : 'N/A'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleEditToggle}
                        disabled={!user}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={handleCloseDetail}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-6 p-6">
                  {isEditMode ? (
                    // Edit mode - show editable form items
                    formItems.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-muted-foreground">No questions found for this form</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {formItems.map((item) => (
                          <div key={item.id} className="rounded-lg border p-4">
                            {renderFormItem(item)}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    // View mode - show answers
                    <>
                      {selectedEntryId && (
                        <div className="space-y-4">
                          <ApprovalStatusAccordian entryId={selectedEntryId} />
                          <EntryResponsesAccordion
                            entryId={selectedEntryId}
                            formItems={formItems}
                            answers={entryDetail.answers}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="border-t bg-muted/30 p-4">
                <div className="flex justify-end gap-2">
                  {isEditMode ? (
                    <>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={handleCloseDetail}>
                        Close
                      </Button>
                      {approvalStatus &&
                        (approvalStatus === 'draft' || approvalStatus === 'revision_requested') && (
                          <Button
                            variant="default"
                            onClick={handleSubmitApproval}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                          </Button>
                        )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* AlertDialog component after the Sheet */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost if you close this panel.
              {Object.keys(formErrors).length > 0 && (
                <p className="mt-2 text-red-500">
                  Note: There are missing required fields that need to be filled.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Default export using the wrapper
export default function EntriesPage() {
  return (
    <Suspense fallback={<div className="container py-6">Loading entries...</div>}>
      <SearchParamsWrapper />
    </Suspense>
  );
}
