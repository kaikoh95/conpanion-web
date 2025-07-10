'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function ClientAuthHandler() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get('invitation');
  const [hasRedirected, setHasRedirected] = useState(false);

  console.log(
    '🔄 ClientAuthHandler: Render - loading:',
    loading,
    'user:',
    user?.email || 'none',
    'hasRedirected:',
    hasRedirected,
  );

  useEffect(() => {
    console.log(
      '🔄 ClientAuthHandler: useEffect triggered - loading:',
      loading,
      'user:',
      user?.email || 'none',
      'invitation:',
      invitationToken || 'none',
    );

    if (!loading && user && !hasRedirected) {
      console.log('✅ ClientAuthHandler: User authenticated, preparing redirect...');
      setHasRedirected(true);

      if (invitationToken) {
        console.log('🔄 ClientAuthHandler: Redirecting to invitation page:', invitationToken);
        router.push(`/invitation/${invitationToken}`);
      } else {
        console.log('🔄 ClientAuthHandler: Redirecting to protected area');
        router.push('/protected');
      }
    } else if (!loading && !user) {
      console.log('🔄 ClientAuthHandler: No user found after loading completed');
    } else if (loading) {
      console.log('🔄 ClientAuthHandler: Still loading auth state...');
    }
  }, [user, loading, router, invitationToken, hasRedirected]);

  return null; // This component doesn't render anything
}
