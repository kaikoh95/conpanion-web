"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { getForms } from "@/lib/api/forms";
import { Form } from "@/lib/types/form";
import { format } from "date-fns";

export function FormsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // Effect to handle initial formId from URL
  const formId = searchParams.get('formId');
  const [selectedFormId, setSelectedFormId] = useState<number | null>(
    formId ? parseInt(formId) : null
  );

  // Effect to fetch forms initially
  useEffect(() => {
    const loadForms = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedForms = await getForms();
        setForms(fetchedForms);
      } catch (err: any) {
        console.error("Error loading forms:", err);
        setError(err.message || "Failed to load forms");
        setForms([]);
      } finally {
        setLoading(false);
      }
    };

    loadForms();
  }, []);

  // Effect to handle initial formId from URL
  useEffect(() => {
    if (formId) {
      const id = parseInt(formId);
      if (!isNaN(id)) {
        setSelectedFormId(id);
      }
    }
  }, [searchParams]);

  const filteredForms = forms.filter(
    (form) => form.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleViewForm = (formId: number | undefined) => {
    if (formId === undefined) return;
    router.push(`/protected/forms?formId=${formId}`);
    setSelectedFormId(formId);
  };

  const handleCreateEntry = (formId: number | undefined) => {
    if (formId === undefined) return;
    router.push(`/protected/forms?formId=${formId}&entryMode=new`);
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">Forms</h1>
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search forms..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-8 w-full sm:w-[250px]"
            />
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Form
          </Button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md text-red-800 dark:text-red-300 mb-4">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array(5).fill(0).map((_, index) => (
            <div 
              key={index} 
              className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded-md"
            />
          ))}
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No forms found.</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            Create your first form
          </Button>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[400px]">Name</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredForms.map((form) => (
                <TableRow 
                  key={form.id}
                  className={selectedFormId === form.id ? "bg-muted/50" : ""}
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="truncate max-w-[300px]">{form.name}</span>
                      <span className="text-xs text-muted-foreground md:hidden">
                        Created: {format(new Date(form.created_at || ''), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {format(new Date(form.created_at || ''), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {form.updated_at ? format(new Date(form.updated_at), 'MMM d, yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewForm(form.id)}
                      >
                        View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleCreateEntry(form.id)}
                      >
                        Entry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateFormDialog 
        open={isCreateDialogOpen} 
        onOpenChange={() => setIsCreateDialogOpen(false)}
        onFormCreated={(newForm) => {
          // Refresh the list by refetching
          getForms().then(fetchedForms => setForms(fetchedForms));
          // Navigate to the newly created form
          if (newForm.id) {
            handleViewForm(newForm.id);
          }
        }}
      />
    </div>
  );
} 