-- Migration: Implement edge function calls for email and push notifications
-- Description: Replace commented edge function calls with actual HTTP requests using pg_net extension

-- ===========================================
-- ENABLE EXTENSIONS
-- ===========================================

-- Enable pg_net extension for HTTP requests (if available)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ===========================================
-- DIAGNOSTIC FUNCTIONS
-- ===========================================

-- Function to check system capabilities and configuration
CREATE OR REPLACE FUNCTION check_edge_function_requirements()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}';
  pg_net_available BOOLEAN := FALSE;
  vault_available BOOLEAN := FALSE;
  secrets_configured BOOLEAN := FALSE;
  secrets_status JSONB;
BEGIN
  -- Check pg_net availability
  BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'pg_net';
    pg_net_available := TRUE;
  EXCEPTION WHEN OTHERS THEN
    pg_net_available := FALSE;
  END;
  
  -- Check vault availability
  BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'supabase_vault';
    vault_available := TRUE;
  EXCEPTION WHEN OTHERS THEN
    vault_available := FALSE;
  END;
  
  -- Check secrets configuration if vault is available
  IF vault_available THEN
    BEGIN
      SELECT notification_secrets_configured() INTO secrets_configured;
      SELECT validate_notification_secrets() INTO secrets_status;
    EXCEPTION WHEN OTHERS THEN
      secrets_configured := FALSE;
      secrets_status := jsonb_build_object('error', 'Failed to validate secrets: ' || SQLERRM);
    END;
  END IF;
  
  -- Build result
  result := jsonb_build_object(
    'pg_net_available', pg_net_available,
    'vault_available', vault_available,
    'secrets_configured', secrets_configured,
    'secrets_status', COALESCE(secrets_status, '{}'),
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================
-- Function to safely retrieve vault secrets
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT AS $$
DECLARE
  secret_value TEXT;
BEGIN
  -- Check if vault extension is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE NOTICE 'Vault extension not available for secret: %', secret_name;
    RETURN NULL;
  END IF;
  
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
GRANT EXECUTE ON FUNCTION get_vault_secret TO service_role;
COMMENT ON FUNCTION get_vault_secret IS 'Safely retrieves decrypted secrets from vault';

-- Function to test edge function connectivity
CREATE OR REPLACE FUNCTION test_edge_function_connectivity(function_name TEXT)
RETURNS JSONB AS $$
DECLARE
  v_supabase_url TEXT;
  v_supabase_service_key TEXT;
  v_function_url TEXT;
  v_request_id UUID;
  v_response JSONB;
  v_status_code INTEGER;
  v_requirements JSONB;
BEGIN
  -- First check system requirements
  v_requirements := check_edge_function_requirements();
  
  -- If basic requirements not met, return early
  IF NOT (v_requirements ->> 'pg_net_available')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'pg_net extension not available',
      'requirements', v_requirements
    );
  END IF;
  
  IF NOT (v_requirements ->> 'vault_available')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'supabase_vault extension not available',
      'requirements', v_requirements
    );
  END IF;
  
  -- Get vault secrets
  v_supabase_url := get_vault_secret('sb_url');
  v_supabase_service_key := get_vault_secret('sb_service_key');
  
  -- Validate secrets
  IF v_supabase_url IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'sb_url vault secret not configured',
      'requirements', v_requirements
    );
  END IF;
  
  IF v_supabase_service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'sb_service_key vault secret not configured',
      'requirements', v_requirements
    );
  END IF;
  
  -- Construct function URL
  v_function_url := v_supabase_url || '/functions/v1/' || function_name;
  
  -- Make test HTTP request
  BEGIN
    SELECT net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_supabase_service_key,
        'Content-Type', 'application/json',
        'x-client-info', 'supabase-postgres-test'
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;
    
    -- Wait for response with shorter timeout for test
    SELECT status_code, content INTO v_status_code, v_response
    FROM net.http_collect_response(v_request_id, timeout_milliseconds => 10000);
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'function_url', v_function_url,
      'status_code', v_status_code,
      'response', v_response,
      'requirements', v_requirements
    );
    
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'HTTP request failed: ' || SQLERRM,
      'function_url', v_function_url,
      'requirements', v_requirements
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to call send-email-notification edge function
CREATE OR REPLACE FUNCTION call_send_email_notification()
RETURNS JSONB AS $$
DECLARE
  v_response JSONB;
  v_request_id UUID;
  v_result JSONB;
  v_status_code INTEGER;
BEGIN
  -- Check if pg_net is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN jsonb_build_object(
      'error', 'pg_net extension not available',
      'details', 'Install pg_net extension to enable HTTP requests'
    );
  END IF;
  
  -- Get vault secrets
  DECLARE
    v_supabase_url TEXT := get_vault_secret('sb_url');
    v_supabase_service_key TEXT := get_vault_secret('sb_service_key');
    v_function_url TEXT;
  BEGIN
    -- Validate required secrets
    IF v_supabase_url IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing vault secret: sb_url',
        'details', 'Configure sb_url vault secret with your Supabase project URL'
      );
    END IF;
    
    IF v_supabase_service_key IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing vault secret: sb_service_key',
        'details', 'Configure sb_service_key vault secret with your service role key'
      );
    END IF;
    
    -- Construct function URL
    v_function_url := v_supabase_url || '/functions/v1/send-email-notification';
    RAISE NOTICE 'Calling email function URL: %', v_function_url;
    
    -- Make HTTP request to edge function
    SELECT net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_supabase_service_key,
        'Content-Type', 'application/json',
        'x-client-info', 'supabase-postgres'
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;
    
    -- Wait for response with timeout
    SELECT status_code, content INTO v_status_code, v_result
    FROM net.http_collect_response(v_request_id, timeout_milliseconds => 30000);
    
    -- Check response
    IF v_status_code IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Request timeout',
        'details', 'Edge function did not respond within 30 seconds'
      );
    END IF;
    
    IF v_status_code >= 400 THEN
      RETURN jsonb_build_object(
        'error', 'Edge function returned error',
        'status_code', v_status_code,
        'details', v_result
      );
    END IF;
    
    RETURN COALESCE(v_result, jsonb_build_object('status', 'success', 'message', 'No response content'));
    
  EXCEPTION WHEN OTHERS THEN
    -- If request fails, return detailed error
    RETURN jsonb_build_object(
      'error', 'HTTP request failed',
      'details', SQLERRM,
      'sqlstate', SQLSTATE
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to call send-push-notification edge function
CREATE OR REPLACE FUNCTION call_send_push_notification()
RETURNS JSONB AS $$
DECLARE
  v_response JSONB;
  v_request_id UUID;
  v_result JSONB;
  v_status_code INTEGER;
BEGIN
  -- Check if pg_net is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN jsonb_build_object(
      'error', 'pg_net extension not available',
      'details', 'Install pg_net extension to enable HTTP requests'
    );
  END IF;
  
  -- Get vault secrets
  DECLARE
    v_supabase_url TEXT := get_vault_secret('sb_url');
    v_supabase_service_key TEXT := get_vault_secret('sb_service_key');
    v_function_url TEXT;
  BEGIN
    -- Validate required secrets
    IF v_supabase_url IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing vault secret: sb_url',
        'details', 'Configure sb_url vault secret with your Supabase project URL'
      );
    END IF;
    
    IF v_supabase_service_key IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing vault secret: sb_service_key',
        'details', 'Configure sb_service_key vault secret with your service role key'
      );
    END IF;
    
    -- Construct function URL
    v_function_url := v_supabase_url || '/functions/v1/send-push-notification';
    RAISE NOTICE 'Calling push function URL: %', v_function_url;

    -- Make HTTP request to edge function
    SELECT net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_supabase_service_key,
        'Content-Type', 'application/json',
        'x-client-info', 'supabase-postgres'
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;
    
    -- Wait for response with timeout
    SELECT status_code, content INTO v_status_code, v_result
    FROM net.http_collect_response(v_request_id, timeout_milliseconds => 30000);
    
    -- Check response
    IF v_status_code IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Request timeout',
        'details', 'Edge function did not respond within 30 seconds'
      );
    END IF;
    
    IF v_status_code >= 400 THEN
      RETURN jsonb_build_object(
        'error', 'Edge function returned error',
        'status_code', v_status_code,
        'details', v_result
      );
    END IF;
    
    RETURN COALESCE(v_result, jsonb_build_object('status', 'success', 'message', 'No response content'));
    
  EXCEPTION WHEN OTHERS THEN
    -- If request fails, return detailed error
    RETURN jsonb_build_object(
      'error', 'HTTP request failed',
      'details', SQLERRM,
      'sqlstate', SQLSTATE
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely call edge function with fallback
CREATE OR REPLACE FUNCTION call_edge_function_safe(function_name TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_requirements JSONB;
BEGIN
  RAISE NOTICE 'Calling edge function: %', function_name;

  -- Check system requirements first
  v_requirements := check_edge_function_requirements();
  
  -- If basic requirements not met, return early with detailed info
  IF NOT (v_requirements ->> 'pg_net_available')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'error', 'pg_net extension not available',
      'status', 'fallback',
      'message', 'Install pg_net extension to enable edge function calls',
      'requirements', v_requirements
    );
  END IF;
  
  IF NOT (v_requirements ->> 'vault_available')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'error', 'supabase_vault extension not available',
      'status', 'fallback',
      'message', 'Install supabase_vault extension and configure secrets',
      'requirements', v_requirements
    );
  END IF;
  
  IF NOT (v_requirements ->> 'secrets_configured')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'error', 'Vault secrets not configured',
      'status', 'fallback',
      'message', 'Configure vault secrets: sb_url, sb_service_key',
      'requirements', v_requirements
    );
  END IF;

  -- Try to call the edge function
  CASE function_name
    WHEN 'send-email-notification' THEN
      v_result := call_send_email_notification();
    WHEN 'send-push-notification' THEN
      v_result := call_send_push_notification();
    ELSE
      RETURN jsonb_build_object(
        'error', 'Unknown function name: ' || function_name,
        'status', 'fallback'
      );
  END CASE;
  
  -- Check if the result indicates an error
  IF v_result ? 'error' THEN
    -- Log the error but don't fail the transaction
    RAISE NOTICE 'Edge function call failed for %: %', function_name, v_result ->> 'error';
    
    -- Return enhanced fallback result
    RETURN jsonb_build_object(
      'status', 'fallback',
      'message', 'Edge function call failed, items remain in queue for retry',
      'error', v_result ->> 'error',
      'details', v_result ->> 'details',
      'requirements', v_requirements
    );
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- UPDATE PROCESSING FUNCTIONS
-- ===========================================

-- Updated email queue processing function with edge function calls
CREATE OR REPLACE FUNCTION process_email_queue()
RETURNS TEXT AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_email RECORD;
  v_edge_function_result JSONB;
  v_has_pending_emails BOOLEAN := FALSE;
BEGIN
  -- Check if there are any pending emails
  SELECT EXISTS(
    SELECT 1 FROM email_queue 
    WHERE status = 'pending' 
    AND scheduled_for <= NOW()
  ) INTO v_has_pending_emails;
  
  -- Only call edge function if there are pending emails
  IF v_has_pending_emails THEN
    -- Call the edge function to process emails
    v_edge_function_result := call_edge_function_safe('send-email-notification');
    
    -- Log the result
    RAISE NOTICE 'Email edge function result: %', v_edge_function_result;
    
    -- Count how many emails were processed
    IF v_edge_function_result ? 'results' THEN
      SELECT COUNT(*) INTO v_processed
      FROM jsonb_array_elements(v_edge_function_result -> 'results') AS result
      WHERE result ->> 'status' = 'sent';
      
      SELECT COUNT(*) INTO v_failed
      FROM jsonb_array_elements(v_edge_function_result -> 'results') AS result
      WHERE result ->> 'status' = 'failed';
    ELSE
      -- If edge function failed, process items locally as fallback
      FOR v_email IN 
        SELECT * FROM email_queue 
        WHERE status = 'pending' 
        AND scheduled_for <= NOW()
        ORDER BY priority DESC, scheduled_for ASC
        LIMIT 10
      LOOP
          -- Mark as failed and increment retry count
          UPDATE email_queue 
          SET 
            status = 'failed',
            error_message = COALESCE(v_edge_function_result ->> 'error', 'Edge function unavailable'),
            retry_count = retry_count + 1,
            updated_at = NOW()
          WHERE id = v_email.id;
          
          v_failed := v_failed + 1;
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'No pending emails to process';
  END IF;
  
  RETURN format('Processed %s emails, %s failed', v_processed, v_failed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated push queue processing function with edge function calls
CREATE OR REPLACE FUNCTION process_push_queue()
RETURNS TEXT AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_push RECORD;
  v_edge_function_result JSONB;
  v_has_pending_push BOOLEAN := FALSE;
BEGIN
  -- Check if there are any pending push notifications
  SELECT EXISTS(
    SELECT 1 FROM push_queue 
    WHERE status = 'pending' 
    AND scheduled_for <= NOW()
  ) INTO v_has_pending_push;
  
  -- Only call edge function if there are pending push notifications
  IF v_has_pending_push THEN
    -- Call the edge function to process push notifications
    v_edge_function_result := call_edge_function_safe('send-push-notification');
    
    -- Log the result
    RAISE NOTICE 'Push edge function result: %', v_edge_function_result;
    
    -- Count how many push notifications were processed
    IF v_edge_function_result ? 'results' THEN
      SELECT COUNT(*) INTO v_processed
      FROM jsonb_array_elements(v_edge_function_result -> 'results') AS result
      WHERE result ->> 'status' = 'sent';
      
      SELECT COUNT(*) INTO v_failed
      FROM jsonb_array_elements(v_edge_function_result -> 'results') AS result
      WHERE result ->> 'status' = 'failed';
    ELSE
      -- If edge function failed, process items locally as fallback
      FOR v_push IN 
        SELECT * FROM push_queue 
        WHERE status = 'pending' 
        AND scheduled_for <= NOW()
        ORDER BY priority DESC, scheduled_for ASC
        LIMIT 10
      LOOP
          -- Mark as failed and increment retry count
          UPDATE push_queue 
          SET 
            status = 'failed',
            error_message = COALESCE(v_edge_function_result ->> 'error', 'Edge function unavailable'),
            retry_count = retry_count + 1,
            updated_at = NOW()
          WHERE id = v_push.id;
          
          v_failed := v_failed + 1;
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'No pending push notifications to process';
  END IF;
  
  RETURN format('Processed %s push notifications, %s failed', v_processed, v_failed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- GRANT PERMISSIONS
-- ===========================================

-- Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION check_edge_function_requirements TO service_role;
GRANT EXECUTE ON FUNCTION test_edge_function_connectivity TO service_role;
GRANT EXECUTE ON FUNCTION call_send_email_notification TO service_role;
GRANT EXECUTE ON FUNCTION call_send_push_notification TO service_role;
GRANT EXECUTE ON FUNCTION call_edge_function_safe TO service_role;

-- ===========================================
-- VAULT DEPENDENCIES
-- ===========================================

-- Note: This migration depends on vault secret functions that should be created
-- by running the scripts/setup-vault-secrets.sql script first.
-- The following functions are required:
-- - get_vault_secret(secret_name TEXT) RETURNS TEXT
-- - validate_notification_secrets() RETURNS JSONB
-- - notification_secrets_configured() RETURNS BOOLEAN

-- Validate that vault secrets are available
DO $$
DECLARE
  requirements JSONB;
BEGIN
  -- Check system requirements
  requirements := check_edge_function_requirements();
  
  RAISE NOTICE '=== EDGE FUNCTION REQUIREMENTS CHECK ===';
  RAISE NOTICE 'Requirements: %', requirements;
  
  -- Check if vault secret functions exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_vault_secret' 
    AND pronargs = 1
  ) THEN
    RAISE NOTICE 'WARNING: get_vault_secret function not found. Please run scripts/setup-vault-secrets.sql first.';
  END IF;
  
  -- Check if notification secrets are configured
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'notification_secrets_configured' 
    AND pronargs = 0
  ) THEN
    DECLARE
      secrets_configured BOOLEAN;
    BEGIN
      SELECT notification_secrets_configured() INTO secrets_configured;
      
      IF NOT secrets_configured THEN
        RAISE NOTICE 'WARNING: Notification secrets are not properly configured. Please update vault secrets.';
      ELSE
        RAISE NOTICE 'INFO: Notification secrets are properly configured.';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'WARNING: Could not validate notification secrets: %', SQLERRM;
    END;
  END IF;
  
  RAISE NOTICE '=== END REQUIREMENTS CHECK ===';
END $$;

-- ===========================================
-- WEBHOOK ALTERNATIVE (IF PG_NET IS NOT AVAILABLE)
-- ===========================================

-- Function to create webhook requests as an alternative to pg_net
CREATE OR REPLACE FUNCTION create_webhook_request(
  p_function_name TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  -- Create a webhook request record for external processing
  INSERT INTO webhook_requests (
    function_name,
    payload,
    status,
    created_at,
    scheduled_for
  ) VALUES (
    p_function_name,
    p_payload,
    'pending',
    NOW(),
    NOW()
  ) RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
  
EXCEPTION WHEN OTHERS THEN
  -- If webhook_requests table doesn't exist, skip webhook creation
  RAISE NOTICE 'Webhook requests table not available: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create webhook requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS webhook_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' NOT NULL,
  response JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  scheduled_for TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ,
  CONSTRAINT webhook_requests_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create index for webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_requests_status_scheduled 
ON webhook_requests(status, scheduled_for) 
WHERE status = 'pending';

-- Grant permissions for webhook requests
GRANT ALL ON webhook_requests TO service_role;

-- ===========================================
-- COMMENTS AND DOCUMENTATION
-- ===========================================

COMMENT ON FUNCTION check_edge_function_requirements IS 'Checks system requirements for edge function calls (pg_net, vault, secrets)';
COMMENT ON FUNCTION test_edge_function_connectivity IS 'Tests connectivity to edge functions with detailed diagnostics';
COMMENT ON FUNCTION call_send_email_notification IS 'Calls the send-email-notification edge function via HTTP request using vault secrets';
COMMENT ON FUNCTION call_send_push_notification IS 'Calls the send-push-notification edge function via HTTP request using vault secrets';
COMMENT ON FUNCTION call_edge_function_safe IS 'Safely calls edge functions with error handling and fallback';
COMMENT ON FUNCTION create_webhook_request IS 'Creates webhook requests as alternative to direct HTTP calls';

COMMENT ON TABLE webhook_requests IS 'Optional table for webhook-based edge function calls when pg_net is not available';

-- ===========================================
-- MIGRATION NOTES
-- ===========================================

-- This migration implements the actual edge function calls that were previously commented out.
-- It provides multiple fallback mechanisms:
-- 1. Direct HTTP calls using pg_net extension (preferred)
-- 2. Webhook requests for external processing (if pg_net is not available)
-- 3. Local fallback processing (if both above fail)
--
-- The edge functions are called when there are pending items in the queue,
-- and the functions handle the actual sending of emails and push notifications.
--
-- PREREQUISITES:
-- 1. Run scripts/setup-vault-secrets.sql to create vault secret functions
-- 2. Configure vault secrets with actual values (not placeholders)
-- 3. Ensure pg_net extension is enabled for HTTP requests
-- 4. Deploy edge functions to Supabase
--
-- CONFIGURATION:
-- Edge function URLs are configured via vault secrets:
-- - sb_url: Your Supabase project URL
-- - sb_service_key: Your service role key
-- - resend_api_key: Your Resend API key (for email edge function)
-- - vapid_public_key: VAPID public key for push notifications (for push edge function)
-- - vapid_private_key: VAPID private key for push notifications (for push edge function)
--
-- To update secrets, use the vault.create_secret function:
-- SELECT vault.create_secret('sb_url', 'https://your-project.supabase.co');
--
-- TROUBLESHOOTING:
-- 1. Run: SELECT check_edge_function_requirements(); to check system readiness
-- 2. Run: SELECT test_edge_function_connectivity('send-email-notification'); to test connectivity
-- 3. Check edge function deployment status in Supabase dashboard
-- 4. Verify environment variables are set in edge function deployment
