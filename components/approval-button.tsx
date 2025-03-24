"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useState } from "react";

export function ApprovalButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateApproval = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      
      // Get the current session to access the auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("No active session");
      }

      // Get the project URL from environment
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!projectUrl) {
        throw new Error("Supabase URL not configured");
      }

      const response = await fetch(`${projectUrl}/functions/v1/create-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          entity_type: "site_diary",
          entity_id: 123,
          requester_id: session.user.id,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create approval: ${response.status}`);
      }

      const data = await response.json();
      console.log("Approval created:", data);
    } catch (error) {
      console.error("Error creating approval:", error);
      setError(error instanceof Error ? error.message : "Failed to create approval");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button 
        onClick={handleCreateApproval} 
        disabled={isLoading}
        variant="default"
      >
        {isLoading ? "Creating Approval..." : "Create Approval"}
      </Button>
      {error && (
        <div className="text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
} 