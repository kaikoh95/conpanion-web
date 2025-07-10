// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log('Queue processor starting...');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Processing notification queues...');

    // Get queue status before processing
    const { data: emailQueueStatus } = await supabase.rpc('get_email_queue_status');
    const { data: pushQueueStatus } = await supabase.rpc('get_push_queue_status');

    console.log('📊 Email queue status:', emailQueueStatus);
    console.log('📊 Push queue status:', pushQueueStatus);

    // Process email queue
    console.log('📧 Processing email queue...');
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    let emailResult;
    try {
      emailResult = await emailResponse.json();
    } catch (e) {
      emailResult = {
        success: false,
        error: `Failed to parse email response: ${e.message}`,
        status: emailResponse.status,
        statusText: emailResponse.statusText,
      };
    }

    console.log('📧 Email processing result:', emailResult);

    // Process push notification queue
    console.log('📱 Processing push queue...');
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    let pushResult;
    try {
      pushResult = await pushResponse.json();
    } catch (e) {
      pushResult = {
        success: false,
        error: `Failed to parse push response: ${e.message}`,
        status: pushResponse.status,
        statusText: pushResponse.statusText,
      };
    }

    console.log('📱 Push processing result:', pushResult);

    // Get updated queue status after processing
    const { data: emailQueueStatusAfter } = await supabase.rpc('get_email_queue_status');
    const { data: pushQueueStatusAfter } = await supabase.rpc('get_push_queue_status');

    // Retry failed notifications (if any exist)
    const retryResult = await supabase.rpc('retry_failed_notifications', { p_max_retries: 3 });

    console.log('🔄 Retry result:', retryResult?.data);

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      email: {
        ...emailResult,
        queue_before: emailQueueStatus,
        queue_after: emailQueueStatusAfter,
      },
      push: {
        ...pushResult,
        queue_before: pushQueueStatus,
        queue_after: pushQueueStatusAfter,
      },
      retries: retryResult?.data || { error: 'Failed to get retry info' },
    };

    console.log('✅ Queue processing complete:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('💥 Error processing notification queues:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-notification-queue' \
    --header 'Authorization: Bearer [SERVICE_ROLE_KEY]' \
    --header 'Content-Type: application/json'

*/
