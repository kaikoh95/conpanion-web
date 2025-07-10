'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { Book, FileText, List, CheckSquare, Clock, User } from 'lucide-react';
import { ApprovalWithDetails } from '@/lib/api/approvals';
import { formatDistanceToNow } from 'date-fns';

interface ApprovalCardProps {
  approval: ApprovalWithDetails;
  onClick?: () => void;
}

export function ApprovalCard({ approval, onClick }: ApprovalCardProps) {
  // Get entity type icon
  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'site_diary':
        return Book;
      case 'form':
        return FileText;
      case 'entries':
        return List;
      case 'tasks':
        return CheckSquare;
      default:
        return FileText;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500 hover:bg-green-600';
      case 'declined':
        return 'bg-red-500 hover:bg-red-600';
      case 'submitted':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'revision_requested':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'draft':
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  // Format status text
  const formatStatus = (status: string) => {
    switch (status) {
      case 'revision_requested':
        return 'Revision Requested';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  // Format entity type
  const formatEntityType = (entityType: string) => {
    switch (entityType) {
      case 'site_diary':
        return 'Site Diary';
      case 'form':
        return 'Form';
      case 'entries':
        return 'Entry';
      case 'tasks':
        return 'Task';
      default:
        return entityType;
    }
  };

  const EntityIcon = getEntityIcon(approval.entity_type);

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Entity Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <EntityIcon className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Main Content */}
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium">{approval.entity_title}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatEntityType(approval.entity_type)} #{approval.entity_id}
                </p>
              </div>
              <Badge className={`${getStatusColor(approval.status)} shrink-0 text-white`}>
                {formatStatus(approval.status)}
              </Badge>
            </div>

            {/* Requester Info */}
            <div className="mb-2 flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  <User className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                Requested by {approval.requester_name}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
