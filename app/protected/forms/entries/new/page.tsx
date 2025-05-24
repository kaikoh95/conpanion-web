"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { X, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getFormById } from "@/lib/api/forms";
import { createFormEntry } from "@/lib/api/form-entries";
import { FormResponse, FormItem } from "@/lib/types/form";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseClient } from '@/lib/supabase/client';

export default function CreateFormEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = searchParams.get('formId');
  
  const { user } = useAuth();
  const [form, setForm] = useState<FormResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [formErrors, setFormErrors] = useState<Record<number, string>>({});
  const [entryName, setEntryName] = useState<string>("");
  const [assignedBy, setAssignedBy] = useState<string | null>(null);
  
  // Format current date for the placeholder
  const currentDate = new Intl.DateTimeFormat('en-US', {
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  useEffect(() => {
    if (!formId) {
      toast.error("No form ID provided");
      router.push('/protected/forms');
      return;
    }

    const fetchForm = async () => {
      try {
        const data = await getFormById(parseInt(formId));
        setForm(data);
        
        // Set default entry name with form name and date
        if (data?.form) {
          setEntryName(`${data.form.name} - ${currentDate}`);
        }
        
        // Check if form was created by current user
        if (data?.form.owner_id === user?.id) {
          setAssignedBy("Me");
        } else if (data?.form.assignees && data.form.assignees.length > 0) {
          // Use the first assignee's name if available
          const assignee = data.form.assignees[0];
          setAssignedBy(assignee.raw_user_meta_data.name || "Unknown");
        } else if (data?.form.owner_id) {
          // Fetch owner details from Supabase
          const supabase = getSupabaseClient();
          const { data: userData, error } = await supabase.rpc('get_user_details', {
            user_ids: [data.form.owner_id]
          });
          
          if (error) {
            console.error('Error fetching owner details:', error);
            setAssignedBy("Unknown");
          } else if (userData && userData.length > 0) {
            const ownerData = userData[0].raw_user_meta_data as { name?: string };
            setAssignedBy(ownerData.name || "Unknown User");
          } else {
            setAssignedBy("Unknown");
          }
        }
      } catch (error) {
        console.error("Error fetching form:", error);
        toast.error("Failed to load form");
      } finally {
        setIsLoading(false);
      }
    };

    fetchForm();
  }, [formId, user?.id]);

  const handleAnswerChange = (itemId: number, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: value,
    }));

    // Clear error for this field if it exists
    if (formErrors[itemId]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[itemId];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<number, string> = {};
    
    // Check for entry name
    if (!entryName.trim()) {
      toast.error("Please provide an entry name");
      return false;
    }
    
    // Check for required fields
    if (form) {
      form.items.forEach((item) => {
        if (item.is_required && (!answers[item.id!] || answers[item.id!] === "")) {
          newErrors[item.id!] = "This field is required";
        }
      });
    }
    
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!user?.id || !form || !formId) return;
    
    if (!validateForm()) {
      toast.error("Please fill all required fields");
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Prepare data for submission
      const entryAnswers = Object.entries(answers).map(([itemId, value]) => ({
        itemId: parseInt(itemId),
        value: value
      }));
      
      const response = await createFormEntry({
        formId: parseInt(formId),
        userId: user.id,
        name: entryName || form.form.name,
        answers: entryAnswers
      });
      
      toast.success("Form entry submitted successfully");
      
      // Navigate to entries page and open the detail panel
      router.push(`/protected/entries?entryId=${response.entry.id}`);
    } catch (error) {
      console.error("Error submitting form entry:", error);
      toast.error("Failed to submit form entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    // Add delay to match animation duration before navigating back
    setTimeout(() => {
      router.push('/protected/forms');
    }, 300);
  };

  const renderFormItem = (item: FormItem) => {
    const itemId = item.id!;
    const hasError = !!formErrors[itemId];
    
    switch (item.item_type) {
      case "question":
        return (
          <div className="space-y-2">
            <Label htmlFor={`question-${itemId}`} className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={`question-${itemId}`}
              value={answers[itemId] || ""}
              onChange={(e) => handleAnswerChange(itemId, e.target.value)}
              className={hasError ? "border-red-500" : ""}
            />
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "radio_box":
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={answers[itemId] || ""}
              onValueChange={(value) => handleAnswerChange(itemId, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {item.options?.filter(option => option.trim() !== "").map((option, index) => (
                  <SelectItem key={index} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "checklist":
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <div className="space-y-2">
              {item.options?.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`checkbox-${itemId}-${index}`}
                    checked={(answers[itemId] || []).includes(option)}
                    onCheckedChange={(checked) => {
                      const currentValues = answers[itemId] || [];
                      const newValues = checked
                        ? [...currentValues, option]
                        : currentValues.filter((v: string) => v !== option);
                      handleAnswerChange(itemId, newValues);
                    }}
                  />
                  <Label htmlFor={`checkbox-${itemId}-${index}`}>{option}</Label>
                </div>
              ))}
            </div>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      case "photo":
        // Placeholder for photo upload (would need additional components)
        return (
          <div className="space-y-2">
            <Label className="font-medium">
              {item.question_value} {item.is_required && <span className="text-red-500">*</span>}
            </Label>
            <Card className="bg-muted/40">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <p className="text-muted-foreground text-sm">Photo upload not yet implemented</p>
              </CardContent>
            </Card>
            {hasError && <p className="text-sm text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Sheet open={true} onOpenChange={() => handleClose()} modal={false}>
      <SheetTitle />
      <SheetContent 
        className={`h-full w-full md:w-[40vw] md:max-w-[40vw] border-l p-0 transition-transform duration-300 focus:outline-none focus-visible:outline-none [&>button]:hidden ${
          isClosing ? 'translate-x-full' : 'translate-x-0'
        }`}
        side="right"
      >
        {isLoading ? (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex-1 overflow-auto">
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : !form ? (
          <div className="flex items-center justify-center h-full">
            <p>Form not found</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-start gap-4">
                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-2">{form.form.name}</h2>
                  {assignedBy && (
                    <p className="text-sm text-muted-foreground">Assigned by {assignedBy}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="entry-name" className="font-medium">
                      Entry Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="entry-name"
                      value={entryName}
                      onChange={(e) => setEntryName(e.target.value)}
                      placeholder="Give this entry a name"
                    />
                  </div>
                  
                  {form.items.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4">
                      {renderFormItem(item)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t">
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
} 