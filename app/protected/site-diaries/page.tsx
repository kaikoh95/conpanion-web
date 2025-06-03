'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, ArrowLeft, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSiteDiariesWithStatus, getSiteDiaryTemplates } from '@/lib/api/site-diaries';
import { SiteDiary, SiteDiaryTemplate } from '@/lib/types/site-diary';
import { ApprovalStatus } from '@/lib/api/entries';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CreateSiteDiarySheet } from './create-site-diary-sheet';
import { ViewSiteDiary } from './view-site-diary';

// Default project ID (as per requirement to assume one project for now)
const DEFAULT_PROJECT_ID = 1;

// Get these from the actual enum or configuration
const APPROVAL_STATUSES: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'revision_requested', label: 'Revision Requested' },
];

// SearchParamsWrapper component to handle the useSearchParams hook
function SearchParamsWrapper() {
  const searchParams = useSearchParams();
  const diaryId = searchParams.get('diaryId');
  const templateId = searchParams.get('templateId');
  const createMode = searchParams.get('create') === 'true';

  return (
    <SiteDiariesPageContent
      diaryId={diaryId ? parseInt(diaryId) : null}
      templateId={templateId ? parseInt(templateId) : null}
      createMode={createMode}
    />
  );
}

// Main component content
function SiteDiariesPageContent({
  diaryId,
  templateId,
  createMode,
}: {
  diaryId: number | null;
  templateId: number | null;
  createMode: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();

  // State for site diaries
  const [diaries, setDiaries] = useState<
    (SiteDiary & { approval_status: ApprovalStatus | null })[]
  >([]);
  const [filteredDiaries, setFilteredDiaries] = useState<
    (SiteDiary & { approval_status: ApprovalStatus | null })[]
  >([]);
  const [templates, setTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ApprovalStatus | 'all'>('all');

  // State for create/view diary
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedDiaryId, setSelectedDiaryId] = useState<number | null>(null);

  // State for user email mappings
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  // Effect to set initial IDs from URL
  useEffect(() => {
    if (diaryId) {
      setSelectedDiaryId(diaryId);
      setIsViewSheetOpen(true);
    }

    if (templateId) {
      setSelectedTemplateId(templateId);
      setIsCreateSheetOpen(createMode);
    }
  }, [diaryId, templateId, createMode]);

  // Effect to fetch data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch site diaries with approval status
        const fetchedDiaries = await getSiteDiariesWithStatus(DEFAULT_PROJECT_ID);
        setDiaries(fetchedDiaries);

        // Apply initial filters
        setFilteredDiaries(filterDiaries(fetchedDiaries, searchTerm, selectedStatus));

        // Fetch templates
        const fetchedTemplates = await getSiteDiaryTemplates(DEFAULT_PROJECT_ID);
        setTemplates(fetchedTemplates);

        // Get unique user IDs from diaries
        const userIds = Array.from(
          new Set(fetchedDiaries.map((diary) => diary.submitted_by_user_id)),
        );

        if (userIds.length > 0) {
          try {
            const supabaseClient = getSupabaseClient();
            const { data: userData, error: userError } = await supabaseClient.rpc(
              'get_user_details',
              {
                user_ids: userIds,
              },
            );

            if (userError) {
              console.error('Error fetching user details:', userError);
            } else if (userData) {
              // Create a mapping of user IDs to emails
              const emailMap: Record<string, string> = {};
              userData.forEach((user: any) => {
                const email = user.raw_user_meta_data?.email || 'Unknown';
                emailMap[user.id] = email;
              });
              setUserEmails(emailMap);
            }
          } catch (err) {
            console.error('Exception fetching user details:', err);
          }
        }
      } catch (err: any) {
        console.error('Error loading data:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Effect to apply filters when search term or status changes
  useEffect(() => {
    setFilteredDiaries(filterDiaries(diaries, searchTerm, selectedStatus));
  }, [diaries, searchTerm, selectedStatus]);

  // Filter diaries by search term and status
  const filterDiaries = (
    diariesToFilter: (SiteDiary & { approval_status: ApprovalStatus | null })[],
    currentSearchTerm: string,
    currentSelectedStatus: ApprovalStatus | 'all',
  ) => {
    return diariesToFilter.filter((diary) => {
      // Filter by search term
      const searchMatch = diary.name.toLowerCase().includes(currentSearchTerm.toLowerCase());

      // Filter by status
      const statusMatch =
        currentSelectedStatus === 'all' || diary.approval_status === currentSelectedStatus;

      return searchMatch && statusMatch;
    });
  };

  // Helper to get user email
  const getUserEmail = (userId: string): string => {
    return userEmails[userId] || userId.substring(0, 8);
  };

  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Handle status selection change
  const handleStatusChange = (value: string) => {
    setSelectedStatus(value as ApprovalStatus | 'all');
  };

  // Handle view diary
  const handleViewDiary = (diaryId: number) => {
    setSelectedDiaryId(diaryId);
    setIsViewSheetOpen(true);
    router.push(`/protected/site-diaries?diaryId=${diaryId}`);
  };

  // Handle create diary
  const handleCreateDiary = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setIsCreateSheetOpen(true);
    router.push(`/protected/site-diaries?templateId=${templateId}&create=true`);
  };

  // Handle close create sheet
  const handleCloseCreateSheet = () => {
    setIsCreateSheetOpen(false);
    setSelectedTemplateId(null);
    router.push('/protected/site-diaries');
  };

  // Handle close view sheet
  const handleCloseViewSheet = () => {
    setIsViewSheetOpen(false);
    setSelectedDiaryId(null);
    router.push('/protected/site-diaries');
  };

  // Get status badge color
  const getStatusColor = (status: ApprovalStatus | null): string => {
    switch (status) {
      case 'approved':
        return 'bg-green-500';
      case 'declined':
        return 'bg-red-500';
      case 'submitted':
        return 'bg-blue-500';
      case 'revision_requested':
        return 'bg-yellow-500';
      case 'draft':
      default:
        return 'bg-gray-500';
    }
  };

  // Get status display text
  const getStatusText = (status: ApprovalStatus | null): string => {
    if (!status) return 'Draft';

    switch (status) {
      case 'approved':
        return 'Approved';
      case 'declined':
        return 'Declined';
      case 'submitted':
        return 'Submitted';
      case 'revision_requested':
        return 'Revision Requested';
      case 'draft':
        return 'Draft';
      default:
        return status;
    }
  };

  // Refresh data after creating/updating a diary
  const handleDiaryUpdated = async () => {
    try {
      setLoading(true);
      const fetchedDiaries = await getSiteDiariesWithStatus(DEFAULT_PROJECT_ID);
      setDiaries(fetchedDiaries);
      setFilteredDiaries(filterDiaries(fetchedDiaries, searchTerm, selectedStatus));
    } catch (err: any) {
      console.error('Error refreshing diaries:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-foreground">Site Diaries</h1>

        {templates.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="w-full md:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Create Site Diary
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Select Template
              </div>
              {templates.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => handleCreateDiary(template.id || 0)}
                >
                  {template.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button className="w-full md:w-auto" disabled>
            <Plus className="mr-2 h-4 w-4" /> No Templates Available
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search site diaries..."
            className="pl-8"
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {searchTerm && (
            <X
              className="absolute right-2 top-2.5 h-4 w-4 cursor-pointer text-muted-foreground"
              onClick={() => setSearchTerm('')}
            />
          )}
        </div>

        <Select defaultValue="all" onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full md:w-48">
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

      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center">Loading site diaries...</div>
      ) : filteredDiaries.length === 0 ? (
        <div className="rounded-lg border py-8 text-center">
          <p className="mb-4 text-muted-foreground">No site diaries found</p>
          {templates.length > 0 && (
            <Button onClick={() => handleCreateDiary(templates[0].id || 0)}>
              <Plus className="mr-2 h-4 w-4" /> Create Site Diary
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDiaries.map((diary) => (
                <TableRow
                  key={diary.id}
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => handleViewDiary(diary.id || 0)}
                >
                  <TableCell className="font-medium">{diary.name}</TableCell>
                  <TableCell>
                    {diary.date ? format(new Date(diary.date), 'MMM d, yyyy') : 'N/A'}
                  </TableCell>
                  <TableCell>{getUserEmail(diary.submitted_by_user_id)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(diary.approval_status)}>
                      {getStatusText(diary.approval_status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {diary.created_at
                      ? format(new Date(diary.created_at), 'MMM d, yyyy h:mm a')
                      : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Site Diary Sheet */}
      <CreateSiteDiarySheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        templateId={selectedTemplateId}
        projectId={DEFAULT_PROJECT_ID}
        onDiaryCreated={handleDiaryUpdated}
        onClose={handleCloseCreateSheet}
      />

      {/* View Site Diary Sheet */}
      <ViewSiteDiary
        open={isViewSheetOpen}
        onOpenChange={setIsViewSheetOpen}
        diaryId={selectedDiaryId}
        onDiaryUpdated={handleDiaryUpdated}
      />
    </div>
  );
}

export default function SiteDiariesPage() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center p-8">Loading site diaries...</div>}
    >
      <SearchParamsWrapper />
    </Suspense>
  );
}
