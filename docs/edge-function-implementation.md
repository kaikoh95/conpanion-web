# Edge Function Implementation for Email and Push Notifications

## Overview

This document describes the implementation of edge function calls for email and push notifications in the consolidated notification system. The migration `20250705225303_implement_edge_function_calls.sql` replaces the previously commented edge function calls with actual HTTP requests.

## What Was Implemented

### 1. Edge Function Calls
- **Email Notifications**: Calls the `send-email-notification` edge function
- **Push Notifications**: Calls the `send-push-notification` edge function

### 2. Multiple Fallback Mechanisms

#### Primary: pg_net Extension
- Uses PostgreSQL's `pg_net` extension for HTTP requests
- Makes direct HTTP calls to Supabase Edge Functions
- Includes proper authorization headers and timeout handling

#### Secondary: Webhook Requests
- Creates webhook request records for external processing
- Useful when `pg_net` is not available or preferred
- Provides a `webhook_requests` table for queue management

#### Tertiary: Local Fallback
- Falls back to local processing if edge functions fail
- Marks items as `queued_for_delivery` for retry
- Prevents complete failure of the notification system

### 3. Updated Processing Functions

#### `process_email_queue()`
- Checks for pending emails before calling edge function
- Calls `call_edge_function_safe('send-email-notification')`
- Parses results to track sent/failed emails
- Includes fallback processing for resilience

#### `process_push_queue()`
- Checks for pending push notifications before calling edge function
- Calls `call_edge_function_safe('send-push-notification')`
- Parses results to track sent/failed push notifications
- Includes fallback processing for resilience

## Configuration

### Setting Up Edge Function URLs

Use the `set_notification_config` function to configure your Supabase project details:

```sql
-- Configure for your Supabase project
SELECT set_notification_config(
  'https://your-project-ref.supabase.co',
  'your-service-role-key'
);
```

### Environment Variables

The edge functions themselves require these environment variables:

**For Email Notifications:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

**For Push Notifications:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`

## How It Works

### Email Flow
1. **Trigger**: Notification is created via `create_notification()` function
2. **Queue**: Email is added to `email_queue` table
3. **Processing**: Cron job runs `process_email_queue()` every 5 minutes
4. **Edge Function**: PostgreSQL calls `send-email-notification` via HTTP
5. **Delivery**: Edge function processes queue and sends emails via Resend
6. **Status Update**: Edge function updates `email_queue` status to 'sent' or 'failed'

### Push Flow
1. **Trigger**: Notification is created via `create_notification()` function
2. **Queue**: Push notification is added to `push_queue` table
3. **Processing**: Cron job runs `process_push_queue()` every 2 minutes
4. **Edge Function**: PostgreSQL calls `send-push-notification` via HTTP
5. **Delivery**: Edge function processes queue and sends push notifications via web-push
6. **Status Update**: Edge function updates `push_queue` status to 'sent' or 'failed'

## New Functions Added

### Core Functions
- `call_send_email_notification()` - Makes HTTP request to email edge function
- `call_send_push_notification()` - Makes HTTP request to push edge function
- `call_edge_function_safe()` - Safely calls edge functions with error handling

### Configuration Functions
- `set_notification_config()` - Sets Supabase URL and service key
- `create_webhook_request()` - Creates webhook requests as alternative

## Error Handling

### Graceful Degradation
1. **Primary Failure**: If edge function call fails, items remain in queue
2. **Retry Logic**: Failed items are retried with exponential backoff
3. **Fallback Processing**: Critical functionality continues even if edge functions are unavailable
4. **Logging**: All failures are logged with detailed error messages

### Status Tracking
- `pending` - Item is waiting to be processed
- `processing` - Item is currently being processed
- `sent` - Item was successfully sent
- `failed` - Item failed to send
- `queued_for_delivery` - Item is queued for retry (fallback mode)

## Monitoring

### Cron Jobs
The following cron jobs are configured to run automatically:
- **Email Processing**: Every 5 minutes
- **Push Processing**: Every 2 minutes
- **Cleanup**: Daily at 2 AM
- **Retry Failed**: Every 30 minutes

### Logs
Monitor PostgreSQL logs for:
- `NOTICE` messages about edge function results
- Error messages from failed edge function calls
- Processing statistics from cron jobs

## Testing

### Manual Testing
```sql
-- Test email processing
SELECT process_email_queue();

-- Test push processing
SELECT process_push_queue();

-- Check configuration
SELECT current_setting('app.settings.supabase_url', true);
SELECT current_setting('app.settings.supabase_service_key', true);
```

### Create Test Notifications
```sql
-- Create test notification (will trigger email/push if configured)
SELECT create_notification(
  p_user_id => 'user-uuid-here',
  p_type => 'system',
  p_title => 'Test Notification',
  p_message => 'This is a test notification',
  p_priority => 'medium'
);
```

## Troubleshooting

### Common Issues

1. **pg_net Extension Not Available**
   - Symptom: Edge functions are not called
   - Solution: Enable pg_net extension or use webhook alternative

2. **Invalid Configuration**
   - Symptom: HTTP requests fail with authentication errors
   - Solution: Check Supabase URL and service key configuration

3. **Edge Function Errors**
   - Symptom: Items remain in `pending` status
   - Solution: Check edge function logs in Supabase dashboard

4. **Environment Variables Missing**
   - Symptom: Edge functions fail to send emails/push notifications
   - Solution: Set required environment variables in Supabase project settings

### Debug Commands
```sql
-- Check pending items
SELECT COUNT(*) FROM email_queue WHERE status = 'pending';
SELECT COUNT(*) FROM push_queue WHERE status = 'pending';

-- Check failed items
SELECT * FROM email_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;
SELECT * FROM push_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- Check recent deliveries
SELECT * FROM notification_deliveries WHERE created_at > NOW() - INTERVAL '1 hour';
```

## Security Considerations

- Service role key is required for edge function calls
- Configuration settings are stored in PostgreSQL settings (not permanently stored)
- HTTP requests include proper authorization headers
- Error messages are logged but sensitive data is not exposed

## Performance Notes

- Edge functions process up to 10 emails and 10 push notifications per call
- HTTP requests have 30-second timeout
- Batch processing reduces database load
- Cron jobs run at different intervals to distribute load

## Future Enhancements

1. **Webhook Processing Service**: External service to process webhook requests
2. **Enhanced Monitoring**: Metrics and alerting for notification delivery
3. **Rate Limiting**: Implement rate limiting for edge function calls
4. **Template Management**: Dynamic email template selection
5. **Delivery Preferences**: Per-user delivery timing preferences