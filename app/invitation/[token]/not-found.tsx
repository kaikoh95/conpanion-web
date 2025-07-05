import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function InvitationNotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-amber-600">Invitation Not Found</CardTitle>
          <CardDescription>This invitation link is invalid or has expired</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-center">
          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">Invalid Invitation Link</p>
            <p className="mt-1 text-sm text-amber-700">
              The invitation you're trying to access either doesn't exist, has been used, or has
              expired.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Please contact the organization administrator for a new invitation.</p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/sign-in">Sign In</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-up">Create Account</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
