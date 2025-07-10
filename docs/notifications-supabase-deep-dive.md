# Supabase Realtime & Database Triggers Deep Dive

## Overview

This document provides an in-depth look at how the notification system leverages Supabase's realtime capabilities and database triggers as the core engine for all notifications. The system is designed to be event-driven, with PostgreSQL triggers handling the business logic and Supabase providing real-time delivery and edge functions for external notifications.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Database Event Occurs                         │
│  (INSERT/UPDATE/DELETE on tasks, projects, approvals, etc.)        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   PostgreSQL Trigger   │
                    │  Evaluates Conditions  │
                    └───────────┬────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
        ┌───────▼────────┐            ┌────────▼────────┐
        │Create Notification│          │ Skip Creation   │
        │    Record        │          │ (conditions not │
        └───────┬────────┘            │     met)        │
                │                     └─────────────────┘
                │
    ┌───────────┴────────────────────────┐
    │                                    │
┌───▼────────────────┐      ┌───────────▼──────────────┐
│ Supabase Realtime  │      │  Trigger Edge Function   │
│ (Instant In-App)   │      │  (Email/Push Delivery)   │
└────────────────────┘      └──────────────────────────┘
```

## Supabase Realtime Configuration

### 1. Enable Realtime on Tables

```sql
-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for specific operations
ALTER TABLE notifications REPLICA IDENTITY FULL;
```

### 2. Realtime Channels Setup

```typescript
// Client-side subscription for user-specific notifications
const setupRealtimeNotifications = (userId: string) => {
  const channel = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // New notification received
        handleNewNotification(payload.new);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Notification updated (e.g., marked as read)
        handleNotificationUpdate(payload.new, payload.old);
      },
    )
    .subscribe();

  return channel;
};
```

### 3. Broadcast for System-wide Notifications

```typescript
// Broadcast channel for system notifications
const systemChannel = supabase
  .channel('system-notifications')
  .on('broadcast', { event: 'system-alert' }, (payload) => {
    // Handle system-wide notifications
    showSystemAlert(payload);
  })
  .subscribe();

// Server-side broadcast
await supabase.channel('system-notifications').send({
  type: 'broadcast',
  event: 'system-alert',
  payload: {
    title: 'Scheduled Maintenance',
    message: 'System will be down for maintenance at 10 PM',
    priority: 'critical',
  },
});
```

## Core Database Triggers

### 1. Master Notification Function

```sql
-- Core function that creates notifications
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT '{}',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_priority notification_priority DEFAULT 'medium',
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_user_preferences RECORD;
BEGIN
  -- Insert the notification
  INSERT INTO notifications (
    user_id, type, title, message, data,
    entity_type, entity_id, priority, created_by
  ) VALUES (
    p_user_id, p_type, p_title, p_message, p_data,
    p_entity_type, p_entity_id, p_priority, COALESCE(p_created_by, auth.uid())
  ) RETURNING id INTO v_notification_id;

  -- Check user preferences for this notification type
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;

  -- Queue email if enabled (or if system notification)
  IF p_type = 'system' OR COALESCE(v_user_preferences.email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;

  -- Queue push if enabled
  IF COALESCE(v_user_preferences.push_enabled, true) THEN
    PERFORM queue_push_notification(v_notification_id);
  END IF;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Task Assignment Trigger

```sql
CREATE OR REPLACE FUNCTION notify_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_project_name TEXT;
  v_assigner_name TEXT;
  v_notification_id UUID;
BEGIN
  -- Task Assignment
  IF TG_OP = 'UPDATE' AND
     NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND
     NEW.assignee_id IS NOT NULL THEN

    -- Get project name
    SELECT name INTO v_project_name
    FROM projects WHERE id = NEW.project_id;

    -- Get assigner name
    SELECT full_name INTO v_assigner_name
    FROM profiles WHERE id = NEW.updated_by;

    -- Create notification
    v_notification_id := create_notification(
      p_user_id => NEW.assignee_id,
      p_type => 'task_assigned',
      p_title => 'New Task Assignment',
      p_message => format('%s assigned you to: %s', v_assigner_name, NEW.title),
      p_data => jsonb_build_object(
        'task_id', NEW.id,
        'project_id', NEW.project_id,
        'project_name', v_project_name,
        'assigned_by', NEW.updated_by,
        'assigner_name', v_assigner_name,
        'due_date', NEW.due_date,
        'priority', NEW.priority
      ),
      p_entity_type => 'task',
      p_entity_id => NEW.id,
      p_priority => CASE
        WHEN NEW.priority = 'urgent' THEN 'high'
        WHEN NEW.priority = 'high' THEN 'high'
        ELSE 'medium'
      END,
      p_created_by => NEW.updated_by
    );

    -- If previously assigned, notify the old assignee
    IF OLD.assignee_id IS NOT NULL THEN
      PERFORM create_notification(
        p_user_id => OLD.assignee_id,
        p_type => 'task_unassigned',
        p_title => 'Task Reassigned',
        p_message => format('You were removed from task: %s', NEW.title),
        p_data => jsonb_build_object(
          'task_id', NEW.id,
          'project_id', NEW.project_id,
          'new_assignee', NEW.assignee_id
        ),
        p_entity_type => 'task',
        p_entity_id => NEW.id,
        p_priority => 'low',
        p_created_by => NEW.updated_by
      );
    END IF;
  END IF;

  -- Task Status Change
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify assignee of status change (if not changed by them)
    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id != NEW.updated_by THEN
      PERFORM create_notification(
        p_user_id => NEW.assignee_id,
        p_type => 'task_updated',
        p_title => 'Task Status Updated',
        p_message => format('Task "%s" status changed from %s to %s',
          NEW.title, OLD.status, NEW.status),
        p_data => jsonb_build_object(
          'task_id', NEW.id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'updated_by', NEW.updated_by
        ),
        p_entity_type => 'task',
        p_entity_id => NEW.id,
        p_priority => 'medium'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_notification_trigger
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_changes();
```

### 3. Task Comment Trigger

```sql
CREATE OR REPLACE FUNCTION notify_task_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_commenter_name TEXT;
  v_mentioned_users UUID[];
  v_user_id UUID;
BEGIN
  -- Get task details
  SELECT t.*, p.name as project_name
  INTO v_task
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  WHERE t.id = NEW.task_id;

  -- Get commenter name
  SELECT full_name INTO v_commenter_name
  FROM profiles WHERE id = NEW.user_id;

  -- Notify task assignee (if not the commenter)
  IF v_task.assignee_id IS NOT NULL AND v_task.assignee_id != NEW.user_id THEN
    PERFORM create_notification(
      p_user_id => v_task.assignee_id,
      p_type => 'task_comment',
      p_title => 'New Comment on Your Task',
      p_message => format('%s commented on "%s"', v_commenter_name, v_task.title),
      p_data => jsonb_build_object(
        'task_id', NEW.task_id,
        'comment_id', NEW.id,
        'comment_preview', LEFT(NEW.content, 100),
        'project_name', v_task.project_name,
        'commenter_id', NEW.user_id,
        'commenter_name', v_commenter_name
      ),
      p_entity_type => 'task_comment',
      p_entity_id => NEW.id,
      p_priority => 'medium',
      p_created_by => NEW.user_id
    );
  END IF;

  -- Extract @mentions from comment
  v_mentioned_users := ARRAY(
    SELECT DISTINCT (regexp_matches(NEW.content, '@([a-f0-9-]{36})', 'g'))[1]::UUID
  );

  -- Notify mentioned users
  FOREACH v_user_id IN ARRAY v_mentioned_users LOOP
    IF v_user_id != NEW.user_id THEN  -- Don't notify self
      PERFORM create_notification(
        p_user_id => v_user_id,
        p_type => 'comment_mention',
        p_title => 'You were mentioned in a comment',
        p_message => format('%s mentioned you in "%s"', v_commenter_name, v_task.title),
        p_data => jsonb_build_object(
          'task_id', NEW.task_id,
          'comment_id', NEW.id,
          'comment_preview', LEFT(NEW.content, 100),
          'project_name', v_task.project_name,
          'commenter_id', NEW.user_id,
          'commenter_name', v_commenter_name
        ),
        p_entity_type => 'task_comment',
        p_entity_id => NEW.id,
        p_priority => 'high',
        p_created_by => NEW.user_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_comment_notification_trigger
AFTER INSERT ON task_comments
FOR EACH ROW
EXECUTE FUNCTION notify_task_comment();
```

### 4. Project/Organization Membership Trigger

```sql
CREATE OR REPLACE FUNCTION notify_membership_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_name TEXT;
  v_added_by_name TEXT;
  v_entity_type TEXT;
BEGIN
  -- Determine entity type
  v_entity_type := TG_TABLE_NAME;

  IF TG_OP = 'INSERT' THEN
    -- Get entity name and added by name
    IF v_entity_type = 'organization_members' THEN
      SELECT o.name, p.full_name
      INTO v_entity_name, v_added_by_name
      FROM organizations o
      LEFT JOIN profiles p ON p.id = NEW.added_by
      WHERE o.id = NEW.organization_id;

      PERFORM create_notification(
        p_user_id => NEW.user_id,
        p_type => 'organization_added',
        p_title => 'Added to Organization',
        p_message => format('You have been added to %s', v_entity_name),
        p_data => jsonb_build_object(
          'organization_id', NEW.organization_id,
          'organization_name', v_entity_name,
          'role', NEW.role,
          'added_by', NEW.added_by,
          'added_by_name', v_added_by_name
        ),
        p_entity_type => 'organization',
        p_entity_id => NEW.organization_id,
        p_priority => 'high',
        p_created_by => NEW.added_by
      );

    ELSIF v_entity_type = 'project_members' THEN
      SELECT p.name, pr.full_name
      INTO v_entity_name, v_added_by_name
      FROM projects p
      LEFT JOIN profiles pr ON pr.id = NEW.added_by
      WHERE p.id = NEW.project_id;

      PERFORM create_notification(
        p_user_id => NEW.user_id,
        p_type => 'project_added',
        p_title => 'Added to Project',
        p_message => format('You have been added to project: %s', v_entity_name),
        p_data => jsonb_build_object(
          'project_id', NEW.project_id,
          'project_name', v_entity_name,
          'role', NEW.role,
          'added_by', NEW.added_by,
          'added_by_name', v_added_by_name
        ),
        p_entity_type => 'project',
        p_entity_id => NEW.project_id,
        p_priority => 'high',
        p_created_by => NEW.added_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_member_notification_trigger
AFTER INSERT ON organization_members
FOR EACH ROW
EXECUTE FUNCTION notify_membership_changes();

CREATE TRIGGER project_member_notification_trigger
AFTER INSERT ON project_members
FOR EACH ROW
EXECUTE FUNCTION notify_membership_changes();
```

### 5. Approval System Triggers

```sql
CREATE OR REPLACE FUNCTION notify_approval_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_approver RECORD;
  v_requester_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get requester name
    SELECT full_name INTO v_requester_name
    FROM profiles WHERE id = NEW.requested_by;

    -- Notify all approvers
    FOR v_approver IN
      SELECT * FROM approval_approvers
      WHERE approval_id = NEW.id
    LOOP
      PERFORM create_notification(
        p_user_id => v_approver.user_id,
        p_type => 'approval_requested',
        p_title => 'Approval Required',
        p_message => format('%s requested approval for: %s',
          v_requester_name, NEW.title),
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'approval_type', NEW.type,
          'amount', NEW.amount,
          'due_date', NEW.due_date,
          'requested_by', NEW.requested_by,
          'requester_name', v_requester_name,
          'description', NEW.description
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id,
        p_priority => CASE
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '1 day' THEN 'critical'
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'high'
          ELSE 'medium'
        END,
        p_created_by => NEW.requested_by
      );
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify requester of status change
    PERFORM create_notification(
      p_user_id => NEW.requested_by,
      p_type => 'approval_status_changed',
      p_title => format('Approval %s', INITCAP(NEW.status)),
      p_message => format('Your approval request "%s" has been %s',
        NEW.title, NEW.status),
      p_data => jsonb_build_object(
        'approval_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'approved_by', NEW.approved_by,
        'comments', NEW.approval_comments
      ),
      p_entity_type => 'approval',
      p_entity_id => NEW.id,
      p_priority => 'high',
      p_created_by => NEW.approved_by
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approval_notification_trigger
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION notify_approval_changes();
```

## Email Notification Handling

### 1. Email Queue Function

```sql
CREATE OR REPLACE FUNCTION queue_email_notification(p_notification_id UUID)
RETURNS VOID AS $$
DECLARE
  v_notification RECORD;
  v_user RECORD;
BEGIN
  -- Get notification and user details
  SELECT n.*, u.email, u.email_verified, p.full_name
  INTO v_notification
  FROM notifications n
  JOIN auth.users u ON n.user_id = u.id
  JOIN profiles p ON p.id = u.id
  WHERE n.id = p_notification_id;

  -- Only queue if user has verified email
  IF v_notification.email_verified THEN
    -- Insert into email queue
    INSERT INTO email_queue (
      notification_id,
      to_email,
      to_name,
      subject,
      template_id,
      template_data,
      priority,
      scheduled_for
    ) VALUES (
      p_notification_id,
      v_notification.email,
      v_notification.full_name,
      v_notification.title,
      v_notification.type || '_template',
      jsonb_build_object(
        'user_name', v_notification.full_name,
        'notification_title', v_notification.title,
        'notification_message', v_notification.message,
        'notification_data', v_notification.data,
        'action_url', format('%s/notifications/%s',
          current_setting('app.base_url'), p_notification_id)
      ),
      v_notification.priority,
      CASE
        WHEN v_notification.priority = 'critical' THEN NOW()
        WHEN v_notification.priority = 'high' THEN NOW() + INTERVAL '5 minutes'
        ELSE NOW() + INTERVAL '15 minutes'
      END
    );

    -- Trigger edge function for critical emails
    IF v_notification.priority = 'critical' THEN
      PERFORM net.http_post(
        url := current_setting('app.supabase_url') ||
               '/functions/v1/send-email-notification',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'notification_id', p_notification_id,
          'priority', 'immediate'
        )
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### 2. Email Delivery Edge Function

```typescript
// supabase/functions/send-email-notification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

serve(async (req) => {
  try {
    const { notification_id, priority } = await req.json();

    // Fetch email from queue
    const { data: emailData, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('notification_id', notification_id)
      .single();

    if (error || !emailData) {
      throw new Error('Email not found in queue');
    }

    // Get email template
    const template = await getEmailTemplate(emailData.template_id);
    const html = await renderTemplate(template, emailData.template_data);

    // Send email via Resend
    const { data, error: sendError } = await resend.emails.send({
      from: 'notifications@construction-pm.com',
      to: emailData.to_email,
      subject: emailData.subject,
      html: html,
      headers: {
        'X-Notification-ID': notification_id,
        'X-Priority': emailData.priority,
      },
    });

    // Update delivery status
    await supabase.from('notification_deliveries').insert({
      notification_id,
      channel: 'email',
      status: sendError ? 'failed' : 'delivered',
      delivered_at: new Date().toISOString(),
      metadata: {
        email_id: data?.id,
        error: sendError?.message,
      },
    });

    // Update queue status
    await supabase
      .from('email_queue')
      .update({
        status: sendError ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        error_message: sendError?.message,
      })
      .eq('id', emailData.id);

    return new Response(JSON.stringify({ success: !sendError }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Email sending error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Email template renderer
async function renderTemplate(template: string, data: any): Promise<string> {
  // Base template with consistent styling
  const baseTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a1a1a; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background: #f5f5f5; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #3b82f6; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
        }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Construction PM</h1>
        </div>
        <div class="content">
          {{content}}
        </div>
        <div class="footer">
          <p>© 2024 Construction PM. All rights reserved.</p>
          <p>
            <a href="{{unsubscribe_url}}">Unsubscribe</a> | 
            <a href="{{preferences_url}}">Update Preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Render specific template content
  let content = template;
  for (const [key, value] of Object.entries(data)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Insert content into base template
  return baseTemplate.replace('{{content}}', content);
}
```

### 3. Email Batch Processing

```sql
-- Function to process email queue in batches
CREATE OR REPLACE FUNCTION process_email_batch()
RETURNS INTEGER AS $$
DECLARE
  v_batch_size INTEGER := 100;
  v_processed INTEGER := 0;
  v_email RECORD;
BEGIN
  -- Process pending emails in batches
  FOR v_email IN
    SELECT * FROM email_queue
    WHERE status = 'pending'
    AND scheduled_for <= NOW()
    ORDER BY priority DESC, created_at ASC
    LIMIT v_batch_size
  LOOP
    -- Call edge function for each email
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') ||
             '/functions/v1/send-email-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'notification_id', v_email.notification_id,
        'queue_id', v_email.id
      ),
      timeout_milliseconds := 30000
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$ LANGUAGE plpgsql;

-- Schedule batch processing every 5 minutes
SELECT cron.schedule(
  'process-email-batch',
  '*/5 * * * *',
  'SELECT process_email_batch()'
);
```

## Push Notification Handling

### 1. Push Queue Function

```sql
CREATE OR REPLACE FUNCTION queue_push_notification(p_notification_id UUID)
RETURNS VOID AS $$
DECLARE
  v_notification RECORD;
  v_devices RECORD;
BEGIN
  -- Get notification details
  SELECT * INTO v_notification
  FROM notifications
  WHERE id = p_notification_id;

  -- Queue push for each user device
  FOR v_devices IN
    SELECT * FROM user_devices
    WHERE user_id = v_notification.user_id
    AND push_enabled = true
    AND token IS NOT NULL
  LOOP
    INSERT INTO push_queue (
      notification_id,
      device_id,
      platform,
      token,
      payload,
      priority,
      scheduled_for
    ) VALUES (
      p_notification_id,
      v_devices.id,
      v_devices.platform,
      v_devices.token,
      jsonb_build_object(
        'title', v_notification.title,
        'body', v_notification.message,
        'data', v_notification.data,
        'badge', 1,
        'sound', 'default',
        'click_action', format('/notifications/%s', p_notification_id)
      ),
      v_notification.priority,
      NOW()  -- Push notifications are sent immediately
    );
  END LOOP;

  -- Trigger edge function for immediate push
  IF EXISTS (SELECT 1 FROM user_devices WHERE user_id = v_notification.user_id) THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') ||
             '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('notification_id', p_notification_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### 2. Push Delivery Edge Function

```typescript
// supabase/functions/send-push-notification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as fcm from 'https://esm.sh/firebase-admin@12.0.0/messaging';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);
fcm.initializeApp({
  credential: fcm.credential.cert(serviceAccount),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

serve(async (req) => {
  try {
    const { notification_id } = await req.json();

    // Fetch push notifications from queue
    const { data: pushNotifications, error } = await supabase
      .from('push_queue')
      .select('*')
      .eq('notification_id', notification_id)
      .eq('status', 'pending');

    if (error || !pushNotifications?.length) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No pending push notifications',
        }),
      );
    }

    const results = await Promise.allSettled(
      pushNotifications.map(async (push) => {
        if (push.platform === 'ios' || push.platform === 'android') {
          return sendFCMNotification(push);
        } else if (push.platform === 'web') {
          return sendWebPush(push);
        }
      }),
    );

    // Update delivery status for each result
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const push = pushNotifications[i];

      await supabase
        .from('push_queue')
        .update({
          status: result.status === 'fulfilled' ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          error_message: result.status === 'rejected' ? result.reason : null,
        })
        .eq('id', push.id);

      await supabase.from('notification_deliveries').insert({
        notification_id,
        channel: 'push',
        status: result.status === 'fulfilled' ? 'delivered' : 'failed',
        delivered_at: new Date().toISOString(),
        metadata: {
          device_id: push.device_id,
          platform: push.platform,
          error: result.status === 'rejected' ? result.reason : null,
        },
      });
    }

    const successCount = results.filter((r) => r.status === 'fulfilled').length;

    return new Response(
      JSON.stringify({
        success: true,
        delivered: successCount,
        total: results.length,
      }),
    );
  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});

async function sendFCMNotification(push: any) {
  const message = {
    token: push.token,
    notification: {
      title: push.payload.title,
      body: push.payload.body,
    },
    data: push.payload.data,
    android: {
      priority: push.priority === 'critical' ? 'high' : 'normal',
      notification: {
        sound: 'default',
        clickAction: push.payload.click_action,
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: push.payload.title,
            body: push.payload.body,
          },
          badge: push.payload.badge,
          sound: push.payload.sound,
        },
      },
    },
  };

  return fcm.messaging().send(message);
}

async function sendWebPush(push: any) {
  // Web push implementation using Web Push Protocol
  // This would integrate with service workers on the web app
  const subscription = JSON.parse(push.token);

  const payload = JSON.stringify({
    title: push.payload.title,
    body: push.payload.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: push.payload.data,
  });

  // Send via web push library
  return webpush.sendNotification(subscription, payload);
}
```

### 3. Device Token Management

```sql
-- Trigger to clean up old device tokens
CREATE OR REPLACE FUNCTION cleanup_invalid_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- If token is invalid (failed multiple times), disable it
  IF NEW.status = 'failed' AND NEW.error_message LIKE '%InvalidRegistration%' THEN
    UPDATE user_devices
    SET push_enabled = false,
        updated_at = NOW()
    WHERE id = NEW.device_id;

    -- Notify user their device needs re-registration
    PERFORM create_notification(
      p_user_id => (SELECT user_id FROM user_devices WHERE id = NEW.device_id),
      p_type => 'system',
      p_title => 'Push Notifications Disabled',
      p_message => 'Push notifications have been disabled for one of your devices. Please re-enable them in settings.',
      p_priority => 'low'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_token_cleanup_trigger
AFTER UPDATE ON push_queue
FOR EACH ROW
WHEN (NEW.status = 'failed')
EXECUTE FUNCTION cleanup_invalid_tokens();
```

## Realtime Dashboard Updates

### 1. Admin Dashboard Realtime

```typescript
// Real-time notification metrics
const setupAdminDashboard = () => {
  // Subscribe to notification stats
  const statsChannel = supabase
    .channel('notification-stats')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
      },
      async () => {
        // Update dashboard metrics
        await updateNotificationMetrics();
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notification_deliveries',
      },
      async () => {
        // Update delivery metrics
        await updateDeliveryMetrics();
      },
    )
    .subscribe();

  return statsChannel;
};

// Broadcast system-wide alerts
const broadcastSystemAlert = async (alert: SystemAlert) => {
  const channel = supabase.channel('system-alerts');

  await channel.send({
    type: 'broadcast',
    event: 'system-alert',
    payload: alert,
  });
};
```

## Performance Optimization

### 1. Notification Aggregation

```sql
-- Function to aggregate similar notifications
CREATE OR REPLACE FUNCTION aggregate_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_notification RECORD;
  v_aggregation_window INTERVAL := '5 minutes';
BEGIN
  -- Check for similar recent notifications
  SELECT * INTO v_existing_notification
  FROM notifications
  WHERE user_id = NEW.user_id
    AND type = NEW.type
    AND entity_type = NEW.entity_type
    AND entity_id != NEW.entity_id  -- Different entity
    AND is_read = false
    AND created_at > NOW() - v_aggregation_window
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND NEW.type IN ('task_comment', 'task_updated') THEN
    -- Update existing notification to aggregate
    UPDATE notifications
    SET title = CASE
          WHEN v_existing_notification.data->>'count' IS NULL
          THEN format('%s and 1 other', v_existing_notification.title)
          ELSE format('%s and %s others',
            SPLIT_PART(v_existing_notification.title, ' and', 1),
            (v_existing_notification.data->>'count')::int + 1)
        END,
        data = v_existing_notification.data ||
               jsonb_build_object(
                 'count', COALESCE((v_existing_notification.data->>'count')::int, 1) + 1,
                 'latest_id', NEW.entity_id
               ),
        updated_at = NOW()
    WHERE id = v_existing_notification.id;

    -- Cancel the new notification
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aggregate_notifications_trigger
BEFORE INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION aggregate_notifications();
```

## Summary

This deep dive shows how the notification system leverages:

1. **Database Triggers as the Core Engine**

   - All business logic lives in PostgreSQL
   - Triggers automatically create notifications on data changes
   - No application code needed for basic notifications

2. **Supabase Realtime for Instant Updates**

   - WebSocket connections for each user
   - Automatic UI updates when notifications are created
   - Broadcast channels for system-wide alerts

3. **Edge Functions for External Delivery**

   - Email delivery via Resend/SendGrid
   - Push notifications via FCM
   - Async processing with retry logic

4. **Performance Optimizations**
   - Notification aggregation to reduce noise
   - Batch processing for emails
   - Smart scheduling based on priority

The system is designed to be highly reliable, scalable, and maintainable, with most logic living in the database where it's closest to the data.
