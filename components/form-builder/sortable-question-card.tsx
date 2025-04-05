"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Trash2, CircleDot, CheckSquare } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableQuestionCardProps } from "@/lib/types/form-builder";

const questionTypes = [
  { value: "question", label: "Short answer" },
  { value: "radio_box", label: "Multiple choice" },
  { value: "checklist", label: "Checkboxes" },
  { value: "photo", label: "Photo" },
] as const;

export function SortableQuestionCard({ question, onUpdate, onDelete, isFirst }: SortableQuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    transition,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Card 
        className={`p-4 ${isDragging ? 'shadow-lg ring-1 ring-primary/20 opacity-50' : ''} transition-shadow duration-200`}
      >
        <div className="flex items-start gap-4">
          <div 
            className="flex-none cursor-grab active:cursor-grabbing touch-none" 
            {...attributes} 
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
              <Input
                value={question.title}
                onChange={(e) =>
                  onUpdate(question.id, { title: e.target.value })
                }
                placeholder="Question here"
                className="text-lg"
              />
              <Select
                value={question.type}
                onValueChange={(value) =>
                  onUpdate(question.id, {
                    type: value as typeof questionTypes[number]["value"],
                  })
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(question.type === "radio_box" || question.type === "checklist") && (
              <div className="space-y-2">
                {question.options?.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    {question.type === "radio_box" ? (
                      <CircleDot className="h-4 w-4" />
                    ) : (
                      <CheckSquare className="h-4 w-4" />
                    )}
                    <Input
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...(question.options || [])];
                        newOptions[optionIndex] = e.target.value;
                        onUpdate(question.id, { options: newOptions });
                      }}
                      placeholder={`Option ${optionIndex + 1}`}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    onUpdate(question.id, {
                      options: [...(question.options || []), ""],
                    })
                  }
                >
                  Add option
                </Button>
              </div>
            )}

            {question.type === "question" && (
              <div className="space-y-2">
                <div className="border rounded-md px-3 py-2 bg-muted/30">
                  <p className="text-sm text-muted-foreground">Text answer</p>
                </div>
              </div>
            )}

            {question.type === "photo" && (
              <div className="space-y-2">
                <div className="border rounded-md px-3 py-2 bg-muted/30">
                  <p className="text-sm text-muted-foreground">Photo upload</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`required-${question.id}`}
                  checked={question.required}
                  onCheckedChange={(checked) =>
                    onUpdate(question.id, { required: checked as boolean })
                  }
                />
                <label
                  htmlFor={`required-${question.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Required
                </label>
              </div>
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(question.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
} 