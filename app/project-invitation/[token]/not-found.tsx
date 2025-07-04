import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ProjectInvitationNotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-red-600">Project Invitation Not Found</CardTitle>
          <CardDescription>
            This project invitation link is invalid or has been removed
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-sm text-red-800">
              <strong>Possible reasons:</strong>
            </p>
            <ul className="mt-2 list-disc list-inside text-sm text-red-700 space-y-1">
              <li>The invitation link is malformed or incomplete</li>
              <li>The invitation has been cancelled by the project administrator</li>
              <li>The invitation has expired</li>
              <li>The invitation has already been used</li>
            </ul>
          </div>
          
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>What you can do:</strong>
            </p>
            <ul className="mt-2 list-disc list-inside text-sm text-blue-700 space-y-1">
              <li>Check the invitation link for any errors</li>
              <li>Contact the person who sent you the invitation</li>
              <li>Request a new invitation from the project administrator</li>
            </ul>
          </div>
        </CardContent>
        
        <CardFooter className="flex gap-3">
          <Button asChild className="flex-1">
            <Link href="/sign-in">Sign In</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/sign-up">Create Account</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}