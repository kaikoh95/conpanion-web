'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Loader2, AlertCircle, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { addApprovalComment } from '@/lib/api/approvals';
import { formatDistanceToNow } from 'date-fns';

interface ApprovalComment {
  id: number;
  comment: string;
  created_at: string | null;
  user_name: string;
}

interface ApprovalCommentsProps {
  approvalId: number;
  comments: ApprovalComment[];
  onCommentAdded?: () => void;
  disabled?: boolean;
}

export function ApprovalComments({
  approvalId,
  comments,
  onCommentAdded,
  disabled = false,
}: ApprovalCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || loading) return;

    try {
      setLoading(true);
      setError(null);

      await addApprovalComment(approvalId, newComment.trim());

      // Clear the comment field
      setNewComment('');

      // Notify parent component to refresh comments
      onCommentAdded?.();
    } catch (err) {
      console.error('Error adding comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  return (
    <div className="space-y-4">
      {/* Comments Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <h3 className="font-medium">Discussion ({comments.length})</h3>
      </div>

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm font-medium">No comments yet</p>
          <p className="mt-1 text-xs">Start the discussion by adding a comment below</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="mt-0.5 h-8 w-8">
                    <AvatarFallback className="text-sm">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-sm font-medium">{comment.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {comment.created_at &&
                          formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {comment.comment}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      {!disabled && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-comment" className="text-sm font-medium">
                  Add a comment
                </Label>
                <Textarea
                  id="new-comment"
                  placeholder="Share your thoughts, ask questions, or provide feedback..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-20 resize-none"
                  disabled={loading}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Press Ctrl+Enter to send quickly</span>
                  <span>{newComment.length}/1000</span>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Comments are visible to the requester, approvers, and project admins
                </div>

                <Button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || loading || newComment.length > 1000}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Text */}
      <div className="space-y-1 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          <strong>💬 Discussion Guidelines:</strong>
        </p>
        <p>• Use comments for ongoing discussion and clarification</p>
        <p>• Action comments (approve/decline/revision) are separate and final</p>
        <p>• All participants can see and respond to comments</p>
        <p>• Be constructive and professional in your feedback</p>
      </div>
    </div>
  );
}
