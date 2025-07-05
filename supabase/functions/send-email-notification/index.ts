// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

console.log('Hello from Functions!');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailNotification {
  id: string;
  user_id: string;
  notification_id: string;
  to_email: string;
  subject: string;
  html_content: string;
  text_content: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Get pending email notifications
    const { data: emailQueue, error: queueError } = await supabase
      .from('email_queue')
      .select(
        `
        *,
        notifications!inner(
          title,
          message,
          type,
          priority,
          entity_type,
          entity_id,
          data,
          user_id,
          user:auth.users(
            email,
            raw_user_meta_data
          )
        )
      `,
      )
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (queueError) {
      throw new Error(`Failed to fetch email queue: ${queueError.message}`);
    }

    if (!emailQueue || emailQueue.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending emails' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const email of emailQueue) {
      try {
        const notification = email.notifications;
        const user = notification.user;
        const userEmail = user.email;
        const userName = user.raw_user_meta_data?.full_name || user.email.split('@')[0];

        // Generate email content based on notification type
        const { subject, html, text } = generateEmailContent(notification, userName);

        // Send email using Resend
        const { data: emailData, error: sendError } = await resend.emails.send({
          from: 'Conpanion <notifications@getconpanion.com>',
          to: userEmail,
          subject,
          html,
          text,
        });

        if (sendError) {
          throw sendError;
        }

        // Update queue status
        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            template_data: { resend_id: emailData?.id },
          })
          .eq('id', email.id);

        // Update delivery status
        await supabase
          .from('notification_deliveries')
          .update({
            delivered_at: new Date().toISOString(),
            status: 'sent',
          })
          .eq('notification_id', email.notification_id)
          .eq('channel', 'email');

        results.push({
          id: email.id,
          status: 'sent',
          resend_id: emailData?.id,
        });
      } catch (error) {
        console.error(`Failed to send email ${email.id}:`, error);

        // Update queue status to failed
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: email.retry_count + 1,
          })
          .eq('id', email.id);

        results.push({
          id: email.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} emails`,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in send-email-notification:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateEmailContent(
  notification: any,
  userName: string,
): {
  subject: string;
  html: string;
  text: string;
} {
  const baseUrl = Deno.env.get('APP_URL') || 'https://www.getconpanion.com';

  // Common email template
  const emailTemplate = (content: string, actionUrl?: string, actionText?: string) => ({
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${notification.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Conpanion</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              ${content}
              ${actionUrl ? `<a href="${actionUrl}" class="button">${actionText || 'View Details'}</a>` : ''}
            </div>
            <div class="footer">
              <p>You're receiving this because of your notification preferences.</p>
              <p><a href="${baseUrl}/protected/settings/notifications">Manage Notifications</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${userName},\n\n${notification.message}\n\n${actionUrl ? `View details: ${actionUrl}` : ''}\n\nManage notifications: ${baseUrl}/protected/settings/notifications`,
  });

  // Generate content based on notification type
  switch (notification.type) {
    case 'task_assigned':
      return {
        subject: `New Task Assigned: ${notification.data?.task_title || 'Task'}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          `${baseUrl}/protected/tasks/${notification.entity_id}`,
          'View Task',
        ),
      };

    case 'task_comment':
      return {
        subject: `New Comment on: ${notification.data?.task_title || 'Task'}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          `${baseUrl}/protected/tasks/${notification.data?.task_id}#comment-${notification.entity_id}`,
          'View Comment',
        ),
      };

    case 'approval_requested':
      return {
        subject: `Approval Required: ${notification.data?.title || 'Approval Request'}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p><p style="color: #ff6600; font-weight: bold;">⚠️ This requires your approval</p>`,
          `${baseUrl}/protected/approvals/${notification.entity_id}`,
          'Review & Approve',
        ),
      };

    case 'organization_added':
      return {
        subject: `You've been added to ${notification.data?.organization_name || 'an organization'}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          `${baseUrl}/protected/organizations/${notification.entity_id}`,
          'View Organization',
        ),
      };

    case 'project_added':
      return {
        subject: `You've been added to ${notification.data?.project_name || 'a project'}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          `${baseUrl}/protected/projects/${notification.entity_id}`,
          'View Project',
        ),
      };

    case 'system':
      return {
        subject: `System Notice: ${notification.title}`,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          notification.data?.action_url,
        ),
      };

    default:
      return {
        subject: notification.title,
        ...emailTemplate(
          `<p><strong>${notification.title}</strong></p><p>${notification.message}</p>`,
          notification.entity_id
            ? `${baseUrl}/protected/${notification.entity_type}s/${notification.entity_id}`
            : undefined,
        ),
      };
  }
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-email-notification' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
