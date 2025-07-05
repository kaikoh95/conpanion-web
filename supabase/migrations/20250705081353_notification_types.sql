-- Migration: Create notification types and enums
-- Description: Sets up the basic types needed for the notification system

-- Notification types enum
CREATE TYPE notification_type AS ENUM (
  'system',
  'organization_added',
  'project_added',
  'task_assigned',
  'task_updated',
  'task_comment',
  'comment_mention',
  'task_unassigned',
  'form_assigned',
  'form_unassigned',
  'approval_requested',
  'approval_status_changed',
  'entity_assigned'
);

-- Priority levels enum
CREATE TYPE notification_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Delivery status enum
CREATE TYPE delivery_status AS ENUM (
  'pending',
  'delivered',
  'failed',
  'retry'
);

-- Email queue status enum
CREATE TYPE email_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled'
);

-- Add comment for documentation
COMMENT ON TYPE notification_type IS 'Types of notifications that can be sent in the system';
COMMENT ON TYPE notification_priority IS 'Priority levels for notification delivery timing';
COMMENT ON TYPE delivery_status IS 'Status of notification delivery attempts';
COMMENT ON TYPE email_status IS 'Status of emails in the queue';