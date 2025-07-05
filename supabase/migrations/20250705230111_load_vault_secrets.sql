-- Migration: Load vault secrets for notification system
-- Description: Set up vault secrets for secure configuration management

-- ===========================================
-- ENABLE VAULT EXTENSION
-- ===========================================

-- Enable vault extension for secure secret management
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ===========================================
-- VAULT SECRETS SETUP
-- ===========================================

-- Insert vault secrets for notification system configuration
-- These secrets will be used by the edge function calls

-- Note: In production, these should be set via Supabase Dashboard or CLI
-- This migration provides the structure and default placeholders

-- Supabase configuration secrets
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
    'your-service-role-key-here',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_resend_api_key',
    'Resend API key for email notifications',
    'your-resend-api-key-here',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_public_key',
    'VAPID public key for push notifications',
    'your-vapid-public-key-here',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_private_key',
    'VAPID private key for push notifications',
    'your-vapid-private-key-here',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  ),
  (
    'notification_vapid_email',
    'VAPID email for push notifications',
    'mailto:notifications@getconpanion.com',
    (SELECT id FROM pgsodium.key WHERE name = 'default' LIMIT 1)
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  secret = EXCLUDED.secret,
  updated_at = NOW();

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
        WHEN secret_value LIKE '%your-%' OR secret_value LIKE '%here%' THEN 'placeholder'
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
-- COMMENTS AND DOCUMENTATION
-- ===========================================

COMMENT ON FUNCTION get_vault_secret IS 'Safely retrieves decrypted secrets from vault';
COMMENT ON FUNCTION update_vault_secret IS 'Updates or inserts vault secrets programmatically';
COMMENT ON FUNCTION validate_notification_secrets IS 'Validates all notification system vault secrets';
COMMENT ON FUNCTION notification_secrets_configured IS 'Checks if all notification secrets are properly configured';

-- ===========================================
-- INITIAL VALIDATION
-- ===========================================

-- Log the current status of secrets
DO $$
DECLARE
  validation_result JSONB;
BEGIN
  validation_result := validate_notification_secrets();
  RAISE NOTICE 'Notification secrets validation: %', validation_result;
  
  IF NOT notification_secrets_configured() THEN
    RAISE NOTICE 'WARNING: Some notification secrets are not properly configured. Please update them using the Supabase dashboard or update_vault_secret function.';
  ELSE
    RAISE NOTICE 'All notification secrets are properly configured.';
  END IF;
END $$;

-- ===========================================
-- CONFIGURATION INSTRUCTIONS
-- ===========================================

-- To update secrets programmatically, use the update_vault_secret function:
-- SELECT update_vault_secret('notification_supabase_url', 'https://your-actual-project.supabase.co');
-- SELECT update_vault_secret('notification_supabase_service_key', 'your-actual-service-key');
-- SELECT update_vault_secret('notification_resend_api_key', 'your-actual-resend-key');
-- SELECT update_vault_secret('notification_vapid_public_key', 'your-actual-vapid-public-key');
-- SELECT update_vault_secret('notification_vapid_private_key', 'your-actual-vapid-private-key');
-- SELECT update_vault_secret('notification_vapid_email', 'mailto:your-actual-email@domain.com');

-- To validate secrets:
-- SELECT validate_notification_secrets();

-- To check if all secrets are configured:
-- SELECT notification_secrets_configured();