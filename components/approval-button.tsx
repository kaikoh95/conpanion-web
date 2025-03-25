"use client";

import { Button } from "@/components/ui/button";
import { createApproval } from "@/lib/api/approvals";
import { useState } from "react";

export function ApprovalButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateApproval = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await createApproval({
        entity_type: "site_diary",
        entity_id: 123,
        requester_id: "user_abc", // You might want to get this from the session
      });

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