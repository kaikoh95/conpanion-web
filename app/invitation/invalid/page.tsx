import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';
import Link from 'next/link';

export default function InvalidInvitationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">Invalid Invitation</CardTitle>
          <CardDescription className="text-gray-600">
            The invitation link you followed is not valid or has been corrupted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-gray-500">
            <p>This could happen if:</p>
            <ul className="mt-2 space-y-1 text-left">
              <li>• The link was copied incorrectly</li>
              <li>• The invitation has been tampered with</li>
              <li>• There was an error in the email</li>
            </ul>
          </div>

          <div className="flex flex-col space-y-2">
            <Button asChild className="w-full">
              <Link href="/sign-in">Sign In to Your Account</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/sign-up">Create New Account</Link>
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              If you believe this is an error, please contact your organization administrator.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
