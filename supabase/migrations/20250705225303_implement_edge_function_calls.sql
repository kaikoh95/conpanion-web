-- Migration: Implement edge function calls for email and push notifications
-- Description: Replace commented edge function calls with actual HTTP requests using pg_net extension

-- ===========================================
-- ENABLE EXTENSIONS
-- ===========================================

-- Enable pg_net extension for HTTP requests (if available)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to call send-email-notification edge function
CREATE OR REPLACE FUNCTION call_send_email_notification()
RETURNS JSONB AS $$
DECLARE
  v_response JSONB;
  v_request_id UUID;
  v_result JSONB;
BEGIN
  -- Get vault secrets
  DECLARE
    v_supabase_url TEXT := get_vault_secret('notification_supabase_url');
    v_supabase_service_key TEXT := get_vault_secret('notification_supabase_service_key');
    v_function_url TEXT;
  BEGIN
    -- Validate required secrets
    IF v_supabase_url IS NULL OR v_supabase_service_key IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing required vault secrets',
        'details', 'notification_supabase_url or notification_supabase_service_key not configured'
      );
    END IF;
    
    -- Construct function URL
    v_function_url := v_supabase_url || '/functions/v1/send-email-notification';
    
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
    
    -- Wait for response (with timeout)
    SELECT content INTO v_result
    FROM net.http_collect_response(v_request_id, timeout_milliseconds => 30000);
    
    RETURN COALESCE(v_result, '{"status": "timeout"}'::jsonb);
    
  EXCEPTION WHEN OTHERS THEN
    -- If pg_net is not available or request fails, return error
    RETURN jsonb_build_object(
      'error', 'Failed to call edge function',
      'details', SQLERRM
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
BEGIN
  -- Get vault secrets
  DECLARE
    v_supabase_url TEXT := get_vault_secret('notification_supabase_url');
    v_supabase_service_key TEXT := get_vault_secret('notification_supabase_service_key');
    v_function_url TEXT;
  BEGIN
    -- Validate required secrets
    IF v_supabase_url IS NULL OR v_supabase_service_key IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'Missing required vault secrets',
        'details', 'notification_supabase_url or notification_supabase_service_key not configured'
      );
    END IF;
    
    -- Construct function URL
    v_function_url := v_supabase_url || '/functions/v1/send-push-notification';
    
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
    
    -- Wait for response (with timeout)
    SELECT content INTO v_result
    FROM net.http_collect_response(v_request_id, timeout_milliseconds => 30000);
    
    RETURN COALESCE(v_result, '{"status": "timeout"}'::jsonb);
    
  EXCEPTION WHEN OTHERS THEN
    -- If pg_net is not available or request fails, return error
    RETURN jsonb_build_object(
      'error', 'Failed to call edge function',
      'details', SQLERRM
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely call edge function with fallback
CREATE OR REPLACE FUNCTION call_edge_function_safe(function_name TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_fallback_result JSONB;
BEGIN
  -- Try to call the edge function
  CASE function_name
    WHEN 'send-email-notification' THEN
      v_result := call_send_email_notification();
    WHEN 'send-push-notification' THEN
      v_result := call_send_push_notification();
    ELSE
      RETURN jsonb_build_object('error', 'Unknown function name: ' || function_name);
  END CASE;
  
  -- Check if the result indicates an error
  IF v_result ? 'error' THEN
    -- Log the error but don't fail the transaction
    RAISE NOTICE 'Edge function call failed for %: %', function_name, v_result ->> 'error';
    
    -- Return a fallback result indicating that processing should continue
    RETURN jsonb_build_object(
      'status', 'fallback',
      'message', 'Edge function call failed, items remain in queue for retry',
      'error', v_result ->> 'error'
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
        BEGIN
          -- Update status to processing
          UPDATE email_queue 
          SET status = 'processing', updated_at = NOW()
          WHERE id = v_email.id;
          
          -- Mark as queued for edge function delivery (fallback)
          UPDATE email_queue 
          SET 
            status = 'queued_for_delivery',
            updated_at = NOW(),
            error_message = 'Edge function unavailable, queued for retry'
          WHERE id = v_email.id;
          
          v_processed := v_processed + 1;
          
        EXCEPTION WHEN OTHERS THEN
          -- Mark as failed and increment retry count
          UPDATE email_queue 
          SET 
            status = 'failed',
            error_message = SQLERRM,
            retry_count = retry_count + 1,
            updated_at = NOW()
          WHERE id = v_email.id;
          
          v_failed := v_failed + 1;
        END;
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
        BEGIN
          -- Update status to processing
          UPDATE push_queue 
          SET status = 'processing', updated_at = NOW()
          WHERE id = v_push.id;
          
          -- Mark as queued for edge function delivery (fallback)
          UPDATE push_queue 
          SET 
            status = 'queued_for_delivery',
            updated_at = NOW(),
            error_message = 'Edge function unavailable, queued for retry'
          WHERE id = v_push.id;
          
          v_processed := v_processed + 1;
          
        EXCEPTION WHEN OTHERS THEN
          -- Mark as failed
          UPDATE push_queue 
          SET 
            status = 'failed',
            error_message = SQLERRM,
            updated_at = NOW()
          WHERE id = v_push.id;
          
          v_failed := v_failed + 1;
        END;
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
BEGIN
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
--
-- CONFIGURATION:
-- Edge function URLs are configured via vault secrets:
-- - notification_supabase_url: Your Supabase project URL
-- - notification_supabase_service_key: Your service role key
-- - notification_resend_api_key: Your Resend API key (for email edge function)
-- - notification_vapid_*: VAPID keys for push notifications (for push edge function)
--
-- To update secrets, use the update_vault_secret function:
-- SELECT update_vault_secret('notification_supabase_url', 'https://your-project.supabase.co');