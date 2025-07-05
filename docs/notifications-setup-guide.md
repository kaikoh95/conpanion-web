# Notification System Setup Guide

## Overview
The notification system is now fully implemented with support for:
- **In-app notifications** (real-time via Supabase Realtime)
- **Email notifications** (via Resend)
- **Push notifications** (via Web Push API with Service Worker)

## Setup Steps

### 1. Run Database Migrations
```bash
npm run db:reset
```
This will apply all notification-related migrations and generate TypeScript types.

### 2. Configure Resend (Email)
Since you're already using Resend for invitations, the email notifications will use the same configuration.

Add to your Supabase Edge Function environment variables:
```bash
RESEND_API_KEY=your-resend-api-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### 3. Generate VAPID Keys (Push Notifications)
First, install web-push locally:
```bash
npm install --save-dev web-push
```

Then generate your VAPID keys:
```bash
node scripts/generate-vapid-keys.js
```

This will output keys to add to:
- `.env.local` (for Next.js)
- Supabase Edge Function environment variables

### 4. Deploy Edge Functions
Deploy the notification processing functions:
```bash
npx supabase functions deploy send-email-notification
npx supabase functions deploy send-push-notification
npx supabase functions deploy process-notification-queue
```

### 5. Set Up Cron Job
In your Supabase dashboard, set up a cron job to process the notification queue:
- Function: `process-notification-queue`
- Schedule: `*/5 * * * *` (every 5 minutes)

### 6. Configure Icons (Optional)
Add app icons for push notifications in `/public/`:
- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`

## How It Works

### Notification Flow
1. **Database triggers** automatically create notifications when:
   - Tasks are assigned/updated
   - Comments are added
   - Users are added to organizations/projects
   - Approvals are requested/updated

2. **Real-time delivery** via Supabase Realtime:
   - NotificationProvider subscribes to user's notifications
   - Shows toast notifications
   - Updates notification bell count

3. **Email delivery** (if enabled in preferences):
   - Queued in `notification_email_queue`
   - Processed by `send-email-notification` edge function
   - Uses Resend API with beautiful HTML templates

4. **Push notifications** (if enabled):
   - Queued in `notification_push_queue`
   - Processed by `send-push-notification` edge function
   - Delivered via Service Worker even when app is closed

### User Features
- **Notification Bell** in top bar with unread count
- **Notification Preferences** at `/protected/settings/notifications`
- **All Notifications** page at `/protected/notifications`
- **Browser/Push permissions** management
- **Per-type channel preferences** (in-app, email, push)

## Testing

### Test In-App Notifications
1. Create a task and assign it to another user
2. The assigned user should receive a real-time notification

### Test Email Notifications
1. Ensure user has email notifications enabled in preferences
2. Trigger a notification (e.g., assign a task)
3. Check email delivery in Resend dashboard

### Test Push Notifications
1. Enable browser notifications in settings
2. Enable push notifications
3. Close the browser/tab
4. Trigger a notification from another account
5. You should receive a push notification

## Troubleshooting

### Service Worker Not Registering
- Ensure HTTPS is enabled (required for service workers)
- Check browser console for errors
- Verify `/service-worker.js` is accessible

### Push Notifications Not Working
- Check VAPID keys are correctly set
- Verify browser supports Push API
- Check notification permissions
- Look at edge function logs in Supabase dashboard

### Email Not Sending
- Verify Resend API key is set
- Check edge function logs
- Ensure email preferences are enabled
- Check Resend dashboard for failures

## Security Considerations
- All notifications respect Row Level Security
- Users can only see their own notifications
- Push subscriptions are tied to user accounts
- Email addresses are verified through Supabase Auth