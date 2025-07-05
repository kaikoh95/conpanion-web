-- Cleanup Script: Drop Notification System
-- Description: Removes all notification system components created by the migration files
-- WARNING: This will permanently delete all notification data and configurations

-- Drop triggers first (dependencies)
DROP TRIGGER IF EXISTS entity_assignment_notification_trigger ON entity_assignees;
DROP TRIGGER IF EXISTS entity_assignment_notification_trigger2 ON entity_assignees;
DROP TRIGGER IF EXISTS entity_unassignment_notification_trigger ON entity_assignees;
DROP TRIGGER IF EXISTS entity_unassignment_notification_trigger2 ON entity_assignees;
DROP TRIGGER IF EXISTS task_update_notification_trigger ON tasks;
DROP TRIGGER IF EXISTS task_comment_notification_trigger ON task_comments;
DROP TRIGGER IF EXISTS project_member_notification_trigger ON projects_users;
DROP TRIGGER IF EXISTS organization_user_notification_trigger ON organization_users;
DROP TRIGGER IF EXISTS approval_notification_trigger ON approvals;

-- Drop functions
DROP FUNCTION IF EXISTS notify_task_assignment_changes();
DROP FUNCTION IF EXISTS notify_task_unassignment();
DROP FUNCTION IF EXISTS notify_form_assignment_changes();
DROP FUNCTION IF EXISTS notify_form_unassignment();
DROP FUNCTION IF EXISTS notify_task_updates();
DROP FUNCTION IF EXISTS notify_task_comment();
DROP FUNCTION IF EXISTS notify_project_membership();
DROP FUNCTION IF EXISTS notify_organization_membership();
DROP FUNCTION IF EXISTS notify_approval_changes();
DROP FUNCTION IF EXISTS create_notification(uuid,notification_type,text,text,jsonb,text,uuid,notification_priority,uuid);
DROP FUNCTION IF EXISTS create_notification(UUID, notification_type, TEXT, TEXT, JSONB, TEXT, TEXT, notification_priority, UUID);
DROP FUNCTION IF EXISTS queue_email_notification(UUID);
DROP FUNCTION IF EXISTS queue_push_notification(UUID);
DROP FUNCTION IF EXISTS mark_notification_read(UUID);
DROP FUNCTION IF EXISTS mark_all_notifications_read();
DROP FUNCTION IF EXISTS get_unread_notification_count();

-- Drop indexes
DROP INDEX IF EXISTS idx_notifications_user_unread;
DROP INDEX IF EXISTS idx_notifications_created;
DROP INDEX IF EXISTS idx_notifications_entity;
DROP INDEX IF EXISTS idx_notifications_type_priority;
DROP INDEX IF EXISTS idx_notifications_user_created;
DROP INDEX IF EXISTS idx_notification_deliveries_notification;
DROP INDEX IF EXISTS idx_notification_deliveries_status;
DROP INDEX IF EXISTS idx_notification_deliveries_channel_status;
DROP INDEX IF EXISTS idx_email_queue_status_scheduled;
DROP INDEX IF EXISTS idx_email_queue_notification;
DROP INDEX IF EXISTS idx_email_queue_priority_scheduled;
DROP INDEX IF EXISTS idx_push_queue_status;
DROP INDEX IF EXISTS idx_push_queue_device;
DROP INDEX IF EXISTS idx_push_queue_notification;
DROP INDEX IF EXISTS idx_user_devices_user;
DROP INDEX IF EXISTS idx_user_devices_token;
DROP INDEX IF EXISTS idx_notification_preferences_user;


-- Drop tables (in dependency order)
DROP TABLE IF EXISTS push_queue;
DROP TABLE IF EXISTS email_queue;
DROP TABLE IF EXISTS user_devices;
DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS notifications;

-- Drop types/enums

-- Revoke permissions (cleanup)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM service_role;

-- Re-grant standard permissions to service_role for existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Success message
SELECT 'Notification system cleanup completed successfully' AS result; 


DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS notification_priority;
DROP TYPE IF EXISTS delivery_status;
DROP TYPE IF EXISTS email_status;