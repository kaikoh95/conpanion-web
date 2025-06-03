'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DatePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({
  date,
  setDate,
  className,
  disabled = false,
  placeholder = 'Select date',
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'flex h-10 w-full items-center justify-start border border-muted-foreground/20 bg-muted px-3 py-2 text-foreground hover:bg-muted/80',
            !date && 'text-muted-foreground',
            className,
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto border-border bg-card p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className="rounded border-0 bg-card text-foreground"
          classNames={{
            day_selected: 'bg-blue-500 text-white hover:bg-blue-600',
            day_today: 'bg-muted text-foreground border border-muted-foreground/20',
            day: 'hover:bg-muted text-foreground focus:bg-muted border border-transparent',
            head_cell: 'text-muted-foreground',
            cell: 'text-center p-0',
            nav_button:
              'bg-muted text-foreground hover:bg-muted/80 border border-muted-foreground/20',
            nav_button_previous: 'absolute left-1',
            nav_button_next: 'absolute right-1',
            caption: 'flex justify-center py-2 relative items-center',
            caption_label: 'text-sm font-medium text-foreground',
            months: 'flex flex-col space-y-4',
            month: 'space-y-3',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
