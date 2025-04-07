"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Trash2, CircleDot, CheckSquare, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableQuestionCardProps } from "@/lib/types/form-builder";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef } from "react";

const questionTypes = [
  { value: "question", label: "Short answer" },
  { value: "radio_box", label: "Multiple choice" },
  { value: "checklist", label: "Checkboxes" },
  { value: "photo", label: "Photo" },
] as const;

export function SortableQuestionCard({ question, onUpdate, onDelete, isFirst, isEditing }: SortableQuestionCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [question.title]);

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

  const renderQuestionPreview = () => {
    switch (question.type) {
      case "question":
        return (
          <div className="border rounded-md px-3 py-2 bg-muted/30">
            <p className="text-sm text-muted-foreground">Text answer</p>
          </div>
        );
      case "photo":
        return (
          <div className="border rounded-md px-3 py-2 bg-muted/30">
            <p className="text-sm text-muted-foreground">Photo upload</p>
          </div>
        );
      case "radio_box":
      case "checklist":
        return (
          <div className="space-y-2 mt-2">
            {question.options?.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2 pl-1">
                {question.type === "radio_box" ? (
                  <CircleDot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <CheckSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm text-muted-foreground">{option}</span>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Card 
        className={`p-4 ${isDragging ? 'shadow-lg ring-1 ring-primary/20 opacity-50' : ''} transition-shadow duration-200`}
      >
        <div className="flex items-start gap-4">
          {isEditing && (
            <div 
              className="flex-none cursor-grab active:cursor-grabbing touch-none" 
              {...attributes} 
              {...listeners}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-4">
            <div className="flex items-start gap-4">
              {isEditing ? (
                <>
                  <div className="flex-1">
                    <Textarea
                      ref={textareaRef}
                      value={question.title}
                      onChange={(e) => {
                        onUpdate(question.id, { title: e.target.value });
                      }}
                      placeholder="Question here"
                      className="text-base resize-none min-h-[2.5rem] overflow-hidden"
                    />
                  </div>
                  <Select
                    value={question.type}
                    onValueChange={(value) =>
                      onUpdate(question.id, {
                        type: value as typeof questionTypes[number]["value"],
                        options: value === "radio_box" || value === "checklist" ? [""] : undefined,
                      })
                    }
                  >
                    <SelectTrigger className="w-[150px] text-left">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {questionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-left">
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <div className="flex items-start justify-between w-full">
                  <p className="text-base font-medium whitespace-pre-wrap">{question.title}</p>
                  <Badge variant="secondary" className="h-6 shrink-0 mt-1">
                    {questionTypes.find(type => type.value === question.type)?.label}
                  </Badge>
                </div>
              )}
            </div>

            {!isEditing ? (
              renderQuestionPreview()
            ) : (
              <>
                {(question.type === "radio_box" || question.type === "checklist") && (
                  <div className="space-y-2">
                    {question.options?.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        {question.type === "radio_box" ? (
                          <CircleDot className="h-4 w-4" />
                        ) : (
                          <CheckSquare className="h-4 w-4" />
                        )}
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...(question.options || [])];
                              newOptions[optionIndex] = e.target.value;
                              onUpdate(question.id, { options: newOptions });
                            }}
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newOptions = [...(question.options || [])];
                              newOptions.splice(optionIndex, 1);
                              onUpdate(question.id, { options: newOptions });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
                      <Plus className="h-4 w-4 mr-2" />
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
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
} 