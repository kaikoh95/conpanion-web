import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, Building2 } from 'lucide-react';
import Link from 'next/link';

interface DeclinedPageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationDeclinedPage({ params }: DeclinedPageProps) {
  // Token not needed for this page, but keeping params for consistency
  await params;

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-red-600">Invitation Declined</CardTitle>
          <CardDescription>
            You have declined the organization invitation
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center space-y-4">
          <div className="rounded-lg bg-red-50 p-4">
            <Building2 className="mx-auto h-8 w-8 text-red-600 mb-2" />
            <p className="text-sm text-red-800 font-medium">
              Invitation Declined
            </p>
            <p className="text-sm text-red-700 mt-1">
              You have chosen not to join this organization. The invitation has been marked as declined.
            </p>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p>If you change your mind, you&apos;ll need to request a new invitation from the organization administrator.</p>
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/protected">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 