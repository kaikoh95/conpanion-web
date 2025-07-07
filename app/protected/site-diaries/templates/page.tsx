'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, X, Pencil, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { getSiteDiaryTemplates, deleteSiteDiaryTemplate } from '@/lib/api/site-diaries';
import { SiteDiaryTemplate } from '@/lib/types/site-diary';
import { useProject } from '@/contexts/ProjectContext';
import { CreateTemplateDialog } from './create-template-dialog';
import { toast } from 'sonner';

// We no longer use a default project ID, instead we use the current project from context

export default function SiteDiaryTemplatesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { current: currentProject } = useProject();

  // State for templates
  const [templates, setTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<SiteDiaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // State for create/edit dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Effect to fetch templates
  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!currentProject?.id) {
          console.log('No current project selected');
          setTemplates([]);
          setFilteredTemplates([]);
          return;
        }

        console.log('Loading site diary templates for project ID:', currentProject.id);

        // Fetch templates
        const fetchedTemplates = await getSiteDiaryTemplates(currentProject.id);
        console.log('Fetched templates:', fetchedTemplates);
        setTemplates(fetchedTemplates);
        setFilteredTemplates(filterTemplates(fetchedTemplates, searchTerm));
      } catch (err: any) {
        console.error('Error loading templates:', err);
        setError(err.message || 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, [currentProject?.id]);

  // Effect to filter templates when search term changes
  useEffect(() => {
    setFilteredTemplates(filterTemplates(templates, searchTerm));
  }, [templates, searchTerm]);

  // Filter templates by search term
  const filterTemplates = (templatesToFilter: SiteDiaryTemplate[], currentSearchTerm: string) => {
    if (!currentSearchTerm.trim()) return templatesToFilter;

    return templatesToFilter.filter(
      (template) =>
        template.name.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
        template.description?.toLowerCase().includes(currentSearchTerm.toLowerCase()),
    );
  };

  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Handle edit template
  const handleEditTemplate = (templateId: number | undefined) => {
    if (templateId) {
      setSelectedTemplateId(templateId);
      setIsCreateDialogOpen(true);
    }
  };

  // Handle delete template
  const handleDeleteTemplate = async (templateId: number | undefined) => {
    if (!templateId) return;

    if (confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      setIsDeleting(true);

      try {
        await deleteSiteDiaryTemplate(templateId);

        // Update templates list
        setTemplates((prevTemplates) =>
          prevTemplates.filter((template) => template.id !== templateId),
        );

        toast.success('Template deleted successfully');
      } catch (err: any) {
        console.error('Error deleting template:', err);
        toast.error(err.message || 'Failed to delete template');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Handle template created or updated
  const handleTemplateChange = (updatedTemplate: SiteDiaryTemplate) => {
    // If template with this ID already exists, update it
    if (updatedTemplate.id && templates.some((t) => t.id === updatedTemplate.id)) {
      setTemplates((prevTemplates) =>
        prevTemplates.map((template) =>
          template.id === updatedTemplate.id ? updatedTemplate : template,
        ),
      );
    } else {
      // Otherwise add it to the list
      setTemplates((prevTemplates) => [updatedTemplate, ...prevTemplates]);
    }

    setIsCreateDialogOpen(false);
    setSelectedTemplateId(null);
  };

  // Create button click handler
  const handleCreateClick = () => {
    setSelectedTemplateId(null);
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <h1 className="text-2xl font-bold text-foreground">Site Diary Templates</h1>

        <Button onClick={handleCreateClick}>
          <Plus className="mr-2 h-4 w-4" /> Create Template
        </Button>
      </div>

      <div className="mb-4 flex justify-between gap-2">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
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
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-lg border py-8 text-center">
          <p className="mb-4 text-muted-foreground">
            {searchTerm ? 'No templates match your search' : 'No templates found'}
          </p>
          <Button onClick={handleCreateClick}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell>{template.description || 'No description'}</TableCell>
                  <TableCell>
                    {template.created_at
                      ? format(new Date(template.created_at), 'MMM d, yyyy h:mm a')
                      : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template.id)}
                        disabled={isDeleting}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <CreateTemplateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={selectedTemplateId}
        projectId={currentProject?.id || 0}
        onTemplateChange={handleTemplateChange}
      />
    </div>
  );
}
