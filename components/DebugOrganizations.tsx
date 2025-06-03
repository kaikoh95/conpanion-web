'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { organizationAPI } from '@/lib/api/organizations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebug } from '@/utils/debug';

export function DebugOrganizations() {
  const { user } = useAuth();
  const [debugData, setDebugData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const isDebug = useDebug();

  // Don't render if debug mode is disabled
  if (!isDebug) {
    return null;
  }

  useEffect(() => {
    const loadDebugData = async () => {
      if (!user) {
        setDebugData({ error: 'No user found' });
        setLoading(false);
        return;
      }

      try {
        console.log('Debug: Starting to load organization data...');
        const results: any = {
          user: {
            id: user.id,
            email: user.email,
          },
          timestamp: new Date().toISOString(),
          step: 'starting',
        };

        // Test each API call individually to see which one fails
        try {
          console.log('Debug: Testing getUserOrganizations...');
          results.step = 'getUserOrganizations';
          const userOrgs = await organizationAPI.getUserOrganizations();
          console.log('Debug: getUserOrganizations result:', userOrgs);
          results.userOrganizations = userOrgs;
          results.userOrganizations_success = true;
        } catch (err) {
          console.error('Debug: getUserOrganizations failed:', err);
          results.userOrganizations_error = String(err);
          results.userOrganizations_success = false;
        }

        try {
          console.log('Debug: Testing getCurrentUserProfile...');
          results.step = 'getCurrentUserProfile';
          const profile = await organizationAPI.getCurrentUserProfile();
          console.log('Debug: getCurrentUserProfile result:', profile);
          results.userProfile = profile;
          results.userProfile_success = true;
        } catch (err) {
          console.error('Debug: getCurrentUserProfile failed:', err);
          results.userProfile_error = JSON.stringify(err, Object.getOwnPropertyNames(err));
          results.userProfile_success = false;
        }

        try {
          console.log('Debug: Testing getCurrentOrganization...');
          results.step = 'getCurrentOrganization';
          const currentOrg = await organizationAPI.getCurrentOrganization();
          console.log('Debug: getCurrentOrganization result:', currentOrg);
          results.currentOrganization = currentOrg;
          results.currentOrganization_success = true;
        } catch (err) {
          console.error('Debug: getCurrentOrganization failed:', err);
          results.currentOrganization_error = JSON.stringify(err, Object.getOwnPropertyNames(err));
          results.currentOrganization_success = false;
        }

        results.step = 'completed';
        setDebugData(results);
      } catch (error) {
        console.error('Debug: Outer error loading organization data:', error);
        setDebugData({
          error: String(error),
          errorType: typeof error,
          errorConstructor: (error as any)?.constructor?.name,
          errorMessage: (error as any)?.message,
          errorCode: (error as any)?.code,
          errorDetails: (error as any)?.details,
          stack: (error as any)?.stack,
          timestamp: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    loadDebugData();
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🔍 Debug Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading debug data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 Debug Organizations</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded bg-muted p-4 text-xs">
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
