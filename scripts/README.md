# Notification System Vault Secrets Setup

This directory contains scripts for setting up vault secrets for the notification system.

## Overview

The notification system uses Supabase Vault to securely store sensitive configuration like API keys and service tokens. This approach is more secure than using environment variables and provides better secret management capabilities.

## Quick Start

### 1. Run the Setup Script

Execute the vault secrets setup script in your Supabase project:

```sql
-- Via Supabase SQL Editor or psql
\i scripts/setup-vault-secrets.sql
```

Or copy and paste the contents of `setup-vault-secrets.sql` into the Supabase SQL Editor.

### 2. Configure Your Secrets

After running the setup script, update the placeholder values with your actual secrets:

```sql
-- Required: Supabase configuration
SELECT vault.create_secret('sb_url', 'https://your-project-ref.supabase.co');
SELECT vault.create_secret('sb_service_key', 'your-actual-service-role-key');

-- Required: Email notifications
SELECT vault.create_secret('resend_api_key', 'your-actual-resend-api-key');

-- Required: Push notifications
SELECT vault.create_secret('vapid_public_key', 'your-actual-vapid-public-key');
SELECT vault.create_secret('vapid_private_key', 'your-actual-vapid-private-key');
SELECT vault.create_secret('vapid_email', 'mailto:your-actual-email@yourdomain.com');
```

### 3. Validate Configuration

Verify that all secrets are properly configured:

```sql
-- Check all notification secrets
SELECT validate_notification_secrets();

-- Verify all secrets are configured (should return true)
SELECT notification_secrets_configured();
```

## Scripts

### `setup-vault-secrets.sql`

Main setup script that:

- Enables the `supabase_vault` extension
- Creates helper functions for managing vault secrets
- Sets up placeholder secrets for development
- Provides validation functions
- Includes comprehensive documentation

## Security Best Practices

### ✅ Do This

- Run the setup script in a secure environment
- Use the `vault.create_secret` function to set real values
- Regularly rotate secrets according to your security policy
- Monitor secret access and usage
- Use environment variables or secure deployment tools for automation

### ❌ Don't Do This

- Never commit actual secrets to version control
- Don't set secrets via direct SQL in scripts that might be versioned
- Don't share service keys or API keys in plain text
- Don't use placeholder values in production

## How Vault Secrets Work

1. **Encryption**: Secrets are encrypted at rest using `pgsodium`
2. **Access Control**: Only `service_role` and `authenticated` users can access functions
3. **Audit Trail**: Secret access can be monitored and logged
4. **Automatic Decryption**: The `get_vault_secret()` function automatically decrypts values

## Troubleshooting

### Common Issues

**Error: "supabase_vault extension not available"**

- Solution: Contact Supabase support or check if vault is enabled for your plan

**Error: "get_vault_secret function not found"**

- Solution: Run the setup script first

**Warning: "Some secrets are not properly configured"**

- Solution: Use `validate_notification_secrets()` to see which secrets need updating

### Debug Commands

```sql
-- See all notification secret names (values are encrypted)
SELECT name, description, created_at, updated_at
FROM vault.secrets
WHERE name LIKE 'notification_%';

-- Check specific secret status
SELECT validate_notification_secrets();

-- Test secret retrieval (only works if you have proper permissions)
SELECT get_vault_secret('sb_url') IS NOT NULL as url_configured;
```

## Integration with Edge Functions

The vault secrets are used by the notification processing functions in PostgreSQL to:

1. Make HTTP requests to Supabase Edge Functions
2. Authenticate with the service role key
3. Provide configuration for email and push notification services

The actual Edge Functions still use environment variables, but these are fetched from vault secrets by the PostgreSQL functions.

## Environment Variable Mapping

| Vault Secret        | Edge Function Env Var       | Purpose                         |
| ------------------- | --------------------------- | ------------------------------- |
| `sb_url`            | `SUPABASE_URL`              | Supabase project URL            |
| `sb_service_key`    | `SUPABASE_SERVICE_ROLE_KEY` | Service authentication          |
| `resend_api_key`    | `RESEND_API_KEY`            | Email service API key           |
| `vapid_public_key`  | `VAPID_PUBLIC_KEY`          | Push notification public key    |
| `vapid_private_key` | `VAPID_PRIVATE_KEY`         | Push notification private key   |
| `vapid_email`       | `VAPID_EMAIL`               | Push notification contact email |

## Next Steps

After setting up vault secrets:

1. Run the notification system migration: `20250705225303_implement_edge_function_calls.sql`
2. Test the notification system with `SELECT process_email_queue();`
3. Monitor logs for any configuration issues
4. Set up monitoring and alerting for notification delivery

## Support

For issues with:

- **Vault setup**: Check Supabase documentation or contact support
- **Secret configuration**: Use the validation functions provided
- **Edge function integration**: Check the main notification system documentation
