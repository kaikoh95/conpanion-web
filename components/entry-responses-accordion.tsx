import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FormItem } from '@/lib/types/form';
import { FormEntryAnswer } from '@/lib/types/form-entry';
import { Check } from 'lucide-react';

interface EntryResponsesAccordionProps {
  entryId: number;
  formItems: FormItem[];
  answers: FormEntryAnswer[];
}

export function EntryResponsesAccordion({
  entryId,
  formItems,
  answers,
}: EntryResponsesAccordionProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Helper function to render the answer value based on the question type
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

  return (
    <Accordion
      type="single"
      collapsible
      className="w-full"
      value={isOpen ? 'responses' : undefined}
      onValueChange={(value) => setIsOpen(value === 'responses')}
    >
      <AccordionItem value="responses" className="border-none">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <span className="font-medium">Form responses</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            {answers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No responses found for this entry
              </div>
            ) : (
              answers.map((answer: FormEntryAnswer) => {
                const matchingItem = formItems.find((item) => item.id === answer.item_id);
                return (
                  <div key={answer.id} className="rounded-lg border p-4">
                    <h3 className="mb-2 text-base font-semibold">
                      {matchingItem
                        ? matchingItem.question_value
                        : `Question ID: ${answer.item_id}`}
                    </h3>
                    <div className="text-sm text-muted-foreground">
                      {matchingItem
                        ? renderAnswer(matchingItem, answer.answer_value)
                        : String(answer.answer_value)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
