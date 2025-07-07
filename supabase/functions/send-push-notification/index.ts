// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Declare Deno namespace for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.6';

console.log('Push notification processor starting...');

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
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:notifications@getconpanion.com';

    // Check for required VAPID keys
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('VAPID keys not configured - push notifications will be skipped');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Push notifications not configured (missing VAPID keys)',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Configure web-push
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    // Get pending push notifications using simplified query
    const { data: pushQueue, error: queueError } = await supabase
      .from('push_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (queueError) {
      console.error('Failed to fetch push queue:', queueError);
      throw new Error(`Failed to fetch push queue: ${queueError.message}`);
    }

    if (!pushQueue || pushQueue.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No pending push notifications',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${pushQueue.length} pending push notifications...`);

    const results: Array<{
      id: string;
      status: string;
      device_id: string;
      platform: string;
      error?: string;
    }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const pushItem of pushQueue) {
      try {
        // Update status to processing first
        const { error: updateError } = await supabase
          .from('push_queue')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', pushItem.id);

        if (updateError) {
          console.error(`Failed to update push ${pushItem.id} to processing:`, updateError);
          continue;
        }

        // Validate device token format
        let subscription;
        try {
          subscription = JSON.parse(pushItem.token);
          
          // Validate required subscription fields
          if (!subscription.endpoint || !subscription.keys) {
            throw new Error('Invalid subscription format: missing endpoint or keys');
          }
        } catch (e) {
          throw new Error(`Invalid device token format: ${e.message}`);
        }

        // Extract payload from queue item
        const payload = pushItem.payload || {};

        // Send push notification
        await webpush.sendNotification(subscription, JSON.stringify(payload));

        // Update queue status to sent
        await supabase
          .from('push_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', pushItem.id);

        // Mark notification delivery as sent
        if (pushItem.notification_id) {
          await supabase.rpc('mark_notification_delivery_sent', {
            p_notification_id: pushItem.notification_id,
            p_channel: 'push'
          });
        }

        console.log(`✅ Push sent successfully: ${pushItem.id} -> ${pushItem.device_id} (${pushItem.platform})`);

        results.push({
          id: pushItem.id,
          status: 'sent',
          device_id: pushItem.device_id,
          platform: pushItem.platform,
        });
        
        successCount++;

      } catch (error: any) {
        console.error(`❌ Failed to send push notification ${pushItem.id}:`, error);

        // Handle specific web-push errors
        let shouldRemoveDevice = false;
        let errorMessage = error.message;

        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription has expired or is no longer valid
          shouldRemoveDevice = true;
          errorMessage = 'Device subscription expired or invalid';
        } else if (error.statusCode === 413) {
          errorMessage = 'Push payload too large';
        } else if (error.statusCode === 429) {
          errorMessage = 'Rate limited by push service';
        }

        // Update queue status to failed
        await supabase
          .from('push_queue')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: (pushItem.retry_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pushItem.id);

        // Mark notification delivery as failed
        if (pushItem.notification_id) {
          await supabase.rpc('mark_notification_delivery_failed', {
            p_notification_id: pushItem.notification_id,
            p_channel: 'push',
            p_error_message: errorMessage
          });
        }

        // Remove invalid device if needed
        if (shouldRemoveDevice && pushItem.device_id) {
          console.log(`🗑️ Removing invalid device: ${pushItem.device_id}`);
          await supabase.from('user_devices').delete().eq('id', pushItem.device_id);
        }

        results.push({
          id: pushItem.id,
          status: 'failed',
          device_id: pushItem.device_id,
          platform: pushItem.platform,
          error: errorMessage,
        });
        
        failureCount++;
      }
    }

    console.log(`📊 Push processing complete: ${successCount} sent, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} push notifications`,
        sent: successCount,
        failed: failureCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('💥 Error in send-push-notification:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-push-notification' \
    --header 'Authorization: Bearer [SERVICE_ROLE_KEY]' \
    --header 'Content-Type: application/json'

*/
