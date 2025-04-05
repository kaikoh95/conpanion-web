"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { getForms } from "@/lib/api/forms";
import { Form } from "@/lib/types/form";
import { format } from "date-fns";
import { useRouter, usePathname } from "next/navigation";

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [forms, setForms] = useState<Form[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

  useEffect(() => {
    // Extract form ID from pathname if it exists
    const match = pathname.match(/\/forms\/(\d+)/);
    if (match) {
      setSelectedFormId(match[1]);
    } else {
      setSelectedFormId(null);
    }
  }, [pathname]);

  const handleFormClick = (formId: number) => {
    setSelectedFormId(formId.toString());
    router.push(`/protected/forms/${formId}`);
  };

  const fetchForms = async () => {
    try {
      setIsLoading(true);
      const data = await getForms();
      setForms(data);
    } catch (error) {
      console.error("Error fetching forms:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const filteredForms = forms.filter((form) => {
    // Apply search filter
    const matchesSearch = form.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply type filter (if implemented)
    const matchesType = typeFilter === "all" || true; // Placeholder for type filtering
    
    // Apply status filter
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "draft" && (!form.assigned_to || form.assigned_to.length === 0)) ||
      (statusFilter === "in-progress" && form.assigned_to && form.assigned_to.length > 0) ||
      (statusFilter === "completed" && form.is_synced);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusColor = (form: Form) => {
    if (form.is_synced) {
      return 'bg-green-500/10 text-green-700 dark:text-green-400';
    } else if (form.assigned_to?.length) {
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    } else {
      return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (form: Form) => {
    if (form.is_synced) {
      return 'Completed';
    } else if (form.assigned_to?.length) {
      return 'In Progress';
    } else {
      return 'Draft';
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Forms</h1>
              <p className="text-muted-foreground mt-1">
                Manage and track all your construction forms
              </p>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Form
            </Button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search forms..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="progress">Progress</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Title</TableHead>
                  <TableHead className="w-[15%]">Type</TableHead>
                  <TableHead className="w-[15%]">Status</TableHead>
                  <TableHead className="w-[20%]">Assigned To</TableHead>
                  <TableHead className="w-[20%]">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      Loading forms...
                    </TableCell>
                  </TableRow>
                ) : filteredForms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      No forms found. Create your first form to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredForms.map((form) => (
                    <TableRow 
                      key={form.id} 
                      className={`cursor-pointer hover:bg-muted/50 ${form.id?.toString() === selectedFormId ? 'bg-muted' : ''}`}
                      onClick={() => handleFormClick(form.id!)}
                    >
                      <TableCell className="font-medium">{form.name}</TableCell>
                      <TableCell>General</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getStatusColor(form)}>
                          {getStatusText(form)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {form.assigned_to && form.assigned_to.length > 0
                          ? `${form.assigned_to.length} user${form.assigned_to.length > 1 ? 's' : ''}`
                          : 'Unassigned'}
                      </TableCell>
                      <TableCell>
                        {form.updated_at 
                          ? format(new Date(form.updated_at), 'MMM d, yyyy')
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <CreateFormDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onFormCreated={fetchForms}
        />
      </div>

      {selectedFormId && children}
    </div>
  );
} 