'use client';

import { Button } from '@/components/ui/button';
import { type ComponentProps, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({ children, pendingText = 'Submitting...', ...props }: Props) {
  const { pending } = useFormStatus();

  useEffect(() => {
    if (pending) {
      console.log('🔄 SubmitButton: Form submission started');
    } else {
      console.log('🔄 SubmitButton: Form submission completed or not started');
    }
  }, [pending]);

  return (
    <Button type="submit" aria-disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
