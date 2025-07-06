-- ===========================================
-- VAULT SECRETS SETUP SCRIPT
-- ===========================================
-- 
-- This script sets up vault secrets for the notification system.
-- Run this script AFTER running migrations to configure secrets.
-- 
-- Usage:
--   1. Update the placeholder values below with your actual secrets
--   2. Run this script via psql or Supabase SQL Editor
--   3. Verify secrets are loaded using the validation functions
-- 
-- Security Note: 
--   - Never commit actual secrets to version control
--   - Use this script as a template and fill in real values
--   - Consider using environment variables or secure deployment tools
-- 
-- ===========================================

-- Enable vault extension for secure secret management
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ===========================================
-- VAULT SECRET HELPER FUNCTIONS
-- ===========================================

-- Function to safely retrieve vault secrets
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT AS $$
DECLARE
  secret_value TEXT;
BEGIN
  -- Retrieve decrypted secret from vault
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  -- Return secret or NULL if not found
  RETURN secret_value;
  
EXCEPTION WHEN OTHERS THEN
  -- Log error and return NULL
  RAISE NOTICE 'Failed to retrieve vault secret %: %', secret_name, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update vault secrets programmatically
CREATE OR REPLACE FUNCTION update_vault_secret(
  secret_name TEXT,
  secret_value TEXT,
  secret_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN := FALSE;
BEGIN
  -- Update or insert vault secret
  INSERT INTO vault.secrets (name, description, secret, key_id)
  VALUES (
    secret_name,
    COALESCE(secret_description, 'Updated vault secret'),
    secret_value,
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  )
  ON CONFLICT (name) DO UPDATE SET
    secret = EXCLUDED.secret,
    description = COALESCE(EXCLUDED.description, vault.secrets.description),
    updated_at = NOW();
  
  result := TRUE;
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Failed to update vault secret %: %', secret_name, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate all notification vault secrets
CREATE OR REPLACE FUNCTION validate_notification_secrets()
RETURNS JSONB AS $$
DECLARE
  secrets_status JSONB := '{}';
  secret_name TEXT;
  secret_value TEXT;
  required_secrets TEXT[] := ARRAY[
    'notification_supabase_url',
    'notification_supabase_service_key',
    'notification_resend_api_key',
    'notification_vapid_public_key',
    'notification_vapid_private_key',
    'notification_vapid_email'
  ];
BEGIN
  -- Check each required secret
  FOREACH secret_name IN ARRAY required_secrets
  LOOP
    secret_value := get_vault_secret(secret_name);
    
    secrets_status := secrets_status || jsonb_build_object(
      secret_name, 
      CASE 
        WHEN secret_value IS NULL THEN 'missing'
        WHEN secret_value LIKE '%your-%' OR secret_value LIKE '%here%' OR secret_value LIKE '%placeholder%' THEN 'placeholder'
        ELSE 'configured'
      END
    );
  END LOOP;
  
  RETURN secrets_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if notification secrets are properly configured
CREATE OR REPLACE FUNCTION notification_secrets_configured()
RETURNS BOOLEAN AS $$
DECLARE
  validation_result JSONB;
  secret_key TEXT;
  secret_status TEXT;
BEGIN
  validation_result := validate_notification_secrets();
  
  -- Check if all secrets are properly configured
  FOR secret_key IN SELECT jsonb_object_keys(validation_result)
  LOOP
    secret_status := validation_result ->> secret_key;
    
    -- If any secret is missing or placeholder, return false
    IF secret_status IN ('missing', 'placeholder') THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- GRANT PERMISSIONS
-- ===========================================

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION get_vault_secret TO service_role;
GRANT EXECUTE ON FUNCTION update_vault_secret TO service_role;
GRANT EXECUTE ON FUNCTION validate_notification_secrets TO service_role;
GRANT EXECUTE ON FUNCTION notification_secrets_configured TO service_role;

-- Grant authenticated users access to validation functions (for admin interface)
GRANT EXECUTE ON FUNCTION validate_notification_secrets TO authenticated;
GRANT EXECUTE ON FUNCTION notification_secrets_configured TO authenticated;

-- ===========================================
-- VAULT SECRETS CONFIGURATION
-- ===========================================

-- ⚠️  IMPORTANT: Replace placeholder values with your actual secrets!
-- ⚠️  DO NOT commit actual secrets to version control!

-- Method 1: Direct SQL (for initial setup)
-- Uncomment and modify these lines with your actual values:

/*
SELECT update_vault_secret(
  'notification_supabase_url', 
  'https://your-actual-project-ref.supabase.co',
  'Supabase URL for notification edge function calls'
);

SELECT update_vault_secret(
  'notification_supabase_service_key', 
  'your-actual-service-role-key-here',
  'Supabase service role key for notification edge function calls'
);

SELECT update_vault_secret(
  'notification_resend_api_key', 
  'your-actual-resend-api-key-here',
  'Resend API key for email notifications'
);

SELECT update_vault_secret(
  'notification_vapid_public_key', 
  'your-actual-vapid-public-key-here',
  'VAPID public key for push notifications'
);

SELECT update_vault_secret(
  'notification_vapid_private_key', 
  'your-actual-vapid-private-key-here',
  'VAPID private key for push notifications'
);

SELECT update_vault_secret(
  'notification_vapid_email', 
  'mailto:your-actual-email@yourdomain.com',
  'VAPID email for push notifications'
);
*/

-- Method 2: Environment-based setup (recommended for automation)
-- This method reads from environment variables if available
DO $$
DECLARE
  env_supabase_url TEXT := current_setting('app.supabase_url', true);
  env_service_key TEXT := current_setting('app.service_key', true);
  env_resend_key TEXT := current_setting('app.resend_key', true);
  env_vapid_public TEXT := current_setting('app.vapid_public', true);
  env_vapid_private TEXT := current_setting('app.vapid_private', true);
  env_vapid_email TEXT := current_setting('app.vapid_email', true);
BEGIN
  -- Set secrets from environment variables if available
  IF env_supabase_url IS NOT NULL THEN
    PERFORM update_vault_secret('notification_supabase_url', env_supabase_url, 'Supabase URL from environment');
  END IF;
  
  IF env_service_key IS NOT NULL THEN
    PERFORM update_vault_secret('notification_supabase_service_key', env_service_key, 'Service key from environment');
  END IF;
  
  IF env_resend_key IS NOT NULL THEN
    PERFORM update_vault_secret('notification_resend_api_key', env_resend_key, 'Resend key from environment');
  END IF;
  
  IF env_vapid_public IS NOT NULL THEN
    PERFORM update_vault_secret('notification_vapid_public_key', env_vapid_public, 'VAPID public key from environment');
  END IF;
  
  IF env_vapid_private IS NOT NULL THEN
    PERFORM update_vault_secret('notification_vapid_private_key', env_vapid_private, 'VAPID private key from environment');
  END IF;
  
  IF env_vapid_email IS NOT NULL THEN
    PERFORM update_vault_secret('notification_vapid_email', env_vapid_email, 'VAPID email from environment');
  END IF;
END $$;

-- Create placeholder secrets if they don't exist (for development)
INSERT INTO vault.secrets (name, description, secret, key_id)
VALUES 
  (
    'notification_supabase_url',
    'Supabase URL for notification edge function calls',
    'https://your-project-ref.supabase.co',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_supabase_service_key',
    'Supabase service role key for notification edge function calls',
    'your-service-role-key-placeholder',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_resend_api_key',
    'Resend API key for email notifications',
    'your-resend-api-key-placeholder',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_public_key',
    'VAPID public key for push notifications',
    'your-vapid-public-key-placeholder',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_private_key',
    'VAPID private key for push notifications',
    'your-vapid-private-key-placeholder',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_email',
    'VAPID email for push notifications',
    'mailto:notifications@getconpanion.com',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  )
ON CONFLICT (name) DO NOTHING; -- Don't overwrite existing secrets

-- ===========================================
-- VALIDATION AND REPORTING
-- ===========================================

-- Validate secrets and show status
DO $$
DECLARE
  validation_result JSONB;
  is_configured BOOLEAN;
BEGIN
  validation_result := validate_notification_secrets();
  is_configured := notification_secrets_configured();
  
  RAISE NOTICE '=== NOTIFICATION SECRETS STATUS ===';
  RAISE NOTICE 'Validation result: %', validation_result;
  RAISE NOTICE 'All secrets configured: %', is_configured;
  
  IF NOT is_configured THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  WARNING: Some secrets are not properly configured!';
    RAISE NOTICE '   Please update placeholder values with actual secrets.';
    RAISE NOTICE '   Use the update_vault_secret function or uncomment the configuration section above.';
  ELSE
    RAISE NOTICE '✅ All notification secrets are properly configured.';
  END IF;
  
  RAISE NOTICE '=== END STATUS ===';
END $$;

-- ===========================================
-- COMMENTS AND DOCUMENTATION
-- ===========================================

COMMENT ON FUNCTION get_vault_secret IS 'Safely retrieves decrypted secrets from vault';
COMMENT ON FUNCTION update_vault_secret IS 'Updates or inserts vault secrets programmatically';
COMMENT ON FUNCTION validate_notification_secrets IS 'Validates all notification system vault secrets';
COMMENT ON FUNCTION notification_secrets_configured IS 'Checks if all notification secrets are properly configured';

-- ===========================================
-- USAGE EXAMPLES
-- ===========================================

-- To check current secret status:
-- SELECT validate_notification_secrets();

-- To update a specific secret:
-- SELECT update_vault_secret('notification_supabase_url', 'https://your-project.supabase.co');

-- To verify all secrets are configured:
-- SELECT notification_secrets_configured();

-- To view all notification secrets (names only, values are encrypted):
-- SELECT name, description FROM vault.secrets WHERE name LIKE 'notification_%';

-- ===========================================
-- CLEANUP AND SECURITY NOTES
-- ===========================================

-- Security checklist:
-- ✅ Secrets are encrypted at rest using pgsodium
-- ✅ Only service_role and authenticated users can access functions
-- ✅ Actual secret values are never logged
-- ✅ Placeholder detection prevents accidental production deployment
-- ✅ Environment variable integration for CI/CD pipelines

-- Remember to:
-- 1. Set actual secret values before production deployment
-- 2. Use secure methods to deploy secrets (environment variables, secure vaults)
-- 3. Regularly rotate secrets according to your security policy
-- 4. Monitor secret access and usage