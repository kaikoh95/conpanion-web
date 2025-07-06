# Edge Function Troubleshooting Guide

## Problem
The database functions are failing to call edge functions with the error:
```json
{
  "error": "Failed to call edge function",
  "status": "fallback",
  "message": "Edge function call failed, items remain in queue for retry"
}
```

## Root Cause Analysis

The updated migration identifies several potential causes:

1. **pg_net extension not enabled**
2. **Vault secrets not configured**
3. **Edge functions not deployed**
4. **Environment variables missing**
5. **Network connectivity issues**

## Step-by-Step Fix

### 1. Check System Requirements

Run this SQL command to diagnose the issue:

```sql
SELECT check_edge_function_requirements();
```

This will return a detailed report showing:
- `pg_net_available`: Whether pg_net extension is enabled
- `vault_available`: Whether supabase_vault extension is enabled
- `secrets_configured`: Whether vault secrets are properly configured
- `secrets_status`: Detailed status of each required secret

### 2. Enable Required Extensions

#### Enable pg_net Extension
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

#### Enable Supabase Vault Extension
```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

### 3. Set Up Vault Secrets

#### Run the vault setup script:
```bash
# In your project directory
psql -h your-db-host -U postgres -d postgres -f scripts/setup-vault-secrets.sql
```

#### Configure actual secrets (replace placeholder values):
```sql
-- Configure Supabase URL and service key
SELECT vault.create_secret(
  'sb_url', 
  'https://your-project-ref.supabase.co',
  'Supabase URL for notification edge function calls'
);

SELECT vault.create_secret(
  'sb_service_key', 
  'your-service-role-key-here',
  'Supabase service role key for notification edge function calls'
);

-- Configure email service (Resend)
SELECT vault.create_secret(
  'resend_api_key', 
  'your-resend-api-key-here',
  'Resend API key for email notifications'
);

-- Configure push notification VAPID keys
SELECT vault.create_secret(
  'vapid_public_key', 
  'your-vapid-public-key-here',
  'VAPID public key for push notifications'
);

SELECT vault.create_secret(
  'vapid_private_key', 
  'your-vapid-private-key-here',
  'VAPID private key for push notifications'
);

SELECT vault.create_secret(
  'vapid_email', 
  'mailto:notifications@yourdomain.com',
  'VAPID email for push notifications'
);
```

### 4. Deploy Edge Functions

Make sure your edge functions are deployed to Supabase:

```bash
# Deploy email notification function
npx supabase functions deploy send-email-notification

# Deploy push notification function  
npx supabase functions deploy send-push-notification
```

### 5. Set Environment Variables

Configure environment variables for your edge functions:

```bash
# Set Supabase environment variables
npx supabase secrets set SUPABASE_URL=https://your-project.supabase.co
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Set email service variables
npx supabase secrets set RESEND_API_KEY=your-resend-api-key
npx supabase secrets set APP_URL=https://your-app-domain.com

# Set push notification variables
npx supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
npx supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
npx supabase secrets set VAPID_EMAIL=notifications@yourdomain.com
```

### 6. Test Edge Function Connectivity

Test each edge function to ensure they're working:

```sql
-- Test email notification function
SELECT test_edge_function_connectivity('send-email-notification');

-- Test push notification function
SELECT test_edge_function_connectivity('send-push-notification');
```

### 7. Generate VAPID Keys (if needed)

If you don't have VAPID keys for push notifications:

```bash
# Run the key generation script
node scripts/generate-vapid-keys.js
```

This will output keys that you can use in your vault secrets.

## Verification Steps

### 1. Check Requirements
```sql
SELECT check_edge_function_requirements();
```
Should return all `true` values.

### 2. Validate Secrets
```sql
SELECT validate_notification_secrets();
```
Should show all secrets as 'configured'.

### 3. Test Connectivity
```sql
SELECT test_edge_function_connectivity('send-email-notification');
SELECT test_edge_function_connectivity('send-push-notification');
```
Should return `success: true`.

### 4. Test Queue Processing
```sql
-- Process email queue
SELECT process_email_queue();

-- Process push queue
SELECT process_push_queue();
```

## Common Issues and Solutions

### Issue 1: pg_net Extension Not Available
**Solution**: Enable the extension or contact your hosting provider if it's not available.

### Issue 2: Edge Functions Not Deployed
**Solution**: Deploy functions using `npx supabase functions deploy <function-name>`.

### Issue 3: Environment Variables Missing
**Solution**: Set all required environment variables using `npx supabase secrets set`.

### Issue 4: Invalid Vault Secrets
**Solution**: Update secrets with actual values, not placeholders.

### Issue 5: Network Connectivity Issues
**Solution**: Check firewall settings and ensure database can reach Supabase edge functions.

## Alternative Solutions

### Webhook Fallback
If pg_net is not available, the migration includes a webhook fallback system that creates webhook requests for external processing.

### Local Processing
If both edge functions and webhooks fail, items remain in the queue for retry.

## Monitoring and Debugging

### Check Processing Results
```sql
-- Check recent email queue processing
SELECT * FROM email_queue WHERE updated_at > NOW() - INTERVAL '1 hour';

-- Check recent push queue processing
SELECT * FROM push_queue WHERE updated_at > NOW() - INTERVAL '1 hour';
```

### View Error Messages
```sql
-- View failed emails with error messages
SELECT id, error_message, retry_count, updated_at 
FROM email_queue 
WHERE status = 'failed' 
ORDER BY updated_at DESC;

-- View failed push notifications with error messages
SELECT id, error_message, retry_count, updated_at 
FROM push_queue 
WHERE status = 'failed' 
ORDER BY updated_at DESC;
```

## Contact Support

If you continue to experience issues:
1. Check the Supabase dashboard for edge function logs
2. Review the error messages in the queue tables
3. Verify all environment variables are set correctly
4. Ensure your API keys are valid and have the correct permissions

The enhanced migration now provides detailed diagnostics to help identify the exact cause of any issues.