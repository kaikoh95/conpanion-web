// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:notifications@projectflow.app'
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Configure web-push
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

    // Get pending push notifications
    const { data: pushQueue, error: queueError } = await supabase
      .from('notification_push_queue')
      .select(`
        *,
        notifications!inner(
          id,
          title,
          message,
          type,
          priority,
          entity_type,
          entity_id,
          data,
          user_id
        ),
        user_devices!inner(
          device_token,
          push_enabled
        )
      `)
      .eq('status', 'pending')
      .eq('user_devices.push_enabled', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10)

    if (queueError) {
      throw new Error(`Failed to fetch push queue: ${queueError.message}`)
    }

    if (!pushQueue || pushQueue.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending push notifications' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    
    for (const pushItem of pushQueue) {
      try {
        const notification = pushItem.notifications
        const device = pushItem.user_devices
        
        // Parse the subscription from device token
        let subscription
        try {
          subscription = JSON.parse(device.device_token)
        } catch (e) {
          throw new Error('Invalid device token format')
        }

        // Prepare push payload
        const payload = {
          title: notification.title,
          message: notification.message,
          icon: '/icon-192x192.png',
          badge: '/icon-72x72.png',
          tag: `notification-${notification.id}`,
          data: {
            notification_id: notification.id,
            entity_type: notification.entity_type,
            entity_id: notification.entity_id,
            priority: notification.priority,
            ...notification.data
          }
        }

        // Send push notification
        await webpush.sendNotification(subscription, JSON.stringify(payload))

        // Update queue status
        await supabase
          .from('notification_push_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', pushItem.id)

        // Update delivery status
        await supabase
          .from('notification_deliveries')
          .update({
            push_sent_at: new Date().toISOString(),
            push_status: 'sent'
          })
          .eq('notification_id', pushItem.notification_id)
          .eq('user_id', notification.user_id)

        results.push({ 
          id: pushItem.id, 
          status: 'sent'
        })

      } catch (error) {
        console.error(`Failed to send push notification ${pushItem.id}:`, error)
        
        // Handle specific web-push errors
        let shouldRemoveDevice = false
        if (error.statusCode === 410) {
          // Subscription has expired or is no longer valid
          shouldRemoveDevice = true
        }

        // Update queue status to failed
        await supabase
          .from('notification_push_queue')
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: pushItem.retry_count + 1
          })
          .eq('id', pushItem.id)

        // Remove invalid device if needed
        if (shouldRemoveDevice && pushItem.device_id) {
          await supabase
            .from('user_devices')
            .delete()
            .eq('id', pushItem.device_id)
        }

        results.push({ 
          id: pushItem.id, 
          status: 'failed', 
          error: error.message 
        })
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Processed ${results.length} push notifications`,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-push-notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-push-notification' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
