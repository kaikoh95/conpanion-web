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
import { Resend } from 'https://esm.sh/resend@2.0.0';

console.log('Email notification processor starting...');

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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Get pending email notifications using simplified query
    const { data: emailQueue, error: queueError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (queueError) {
      console.error('Failed to fetch email queue:', queueError);
      throw new Error(`Failed to fetch email queue: ${queueError.message}`);
    }

    if (!emailQueue || emailQueue.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending emails',
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(`Processing ${emailQueue.length} pending emails...`);

    const results: Array<{
      id: string;
      status: string;
      to: string;
      resend_id?: string;
      error?: string;
    }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const email of emailQueue) {
      try {
        // Update status to processing first
        const { error: updateError } = await supabase
          .from('email_queue')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        if (updateError) {
          console.error(`Failed to update email ${email.id} to processing:`, updateError);
          continue;
        }

        // Extract template data
        const templateData = email.template_data || {};
        const userEmail = email.to_email;
        const userName = email.to_name || templateData.user_name || userEmail.split('@')[0];

        // Generate email content based on notification type
        const { subject, html, text } = generateEmailContent(
          email.template_id,
          email.subject,
          templateData,
          userName,
        );

        // Send email using Resend
        const { data: emailData, error: sendError } = await resend.emails.send({
          from: 'Conpanion <notifications@getconpanion.com>',
          to: userEmail,
          subject,
          html,
          text,
        });

        if (sendError) {
          throw new Error(`Resend error: ${sendError.message || JSON.stringify(sendError)}`);
        }

        // Update queue status to sent
        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            template_data: {
              ...templateData,
              resend_id: emailData?.id,
              email_content: { subject, html: html.substring(0, 500) + '...', text },
            },
          })
          .eq('id', email.id);

        // Mark notification delivery as sent
        if (email.notification_id) {
          await supabase.rpc('mark_notification_delivery_sent', {
            p_notification_id: email.notification_id,
            p_channel: 'email',
          });
        }

        console.log(`✅ Email sent successfully: ${email.id} -> ${userEmail}`);

        results.push({
          id: email.id,
          status: 'sent',
          to: userEmail,
          resend_id: emailData?.id,
        });

        successCount++;
      } catch (error) {
        console.error(`❌ Failed to send email ${email.id}:`, error);

        // Update queue status to failed
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: (email.retry_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        // Mark notification delivery as failed
        if (email.notification_id) {
          await supabase.rpc('mark_notification_delivery_failed', {
            p_notification_id: email.notification_id,
            p_channel: 'email',
            p_error_message: error.message,
          });
        }

        results.push({
          id: email.id,
          status: 'failed',
          to: email.to_email,
          error: error.message,
        });

        failureCount++;
      }
    }

    console.log(`📊 Email processing complete: ${successCount} sent, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} emails`,
        sent: successCount,
        failed: failureCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('💥 Error in send-email-notification:', error);
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

function generateEmailContent(
  templateId: string,
  defaultSubject: string,
  templateData: Record<string, any>,
  userName: string,
): {
  subject: string;
  html: string;
  text: string;
} {
  const baseUrl = Deno.env.get('APP_URL') || 'https://www.getconpanion.com';

  // Extract common data
  const notificationTitle = templateData.notification_title || defaultSubject;
  const notificationMessage = templateData.notification_message || '';
  const notificationType = templateData.notification_type || templateId;
  const entityType = templateData.entity_type;
  const entityId = templateData.entity_id;
  const notificationData = templateData.notification_data || {};

  // Common email template
  const emailTemplate = (content: string, actionUrl?: string, actionText?: string) => ({
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${notificationTitle}</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 20px; 
              background-color: #f5f5f5;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              border-radius: 8px; 
              overflow: hidden; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #0066cc, #004499); 
              color: white; 
              padding: 30px 20px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 24px; 
              font-weight: 600;
            }
            .content { 
              padding: 30px; 
            }
            .content h2 {
              color: #333;
              margin-top: 0;
              margin-bottom: 15px;
              font-size: 20px;
            }
            .content p {
              margin-bottom: 15px;
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #0066cc; 
              color: white; 
              text-decoration: none; 
              border-radius: 6px; 
              margin-top: 20px; 
              font-weight: 500;
              box-shadow: 0 2px 4px rgba(0,102,204,0.3);
            }
            .button:hover {
              background: #0052a3;
            }
            .footer { 
              background: #f8f9fa;
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #666; 
              border-top: 1px solid #e9ecef;
            }
            .footer a {
              color: #0066cc;
              text-decoration: none;
            }
            .priority-high {
              border-left: 4px solid #ff6600;
              padding-left: 16px;
              margin: 15px 0;
            }
            .priority-critical {
              border-left: 4px solid #dc3545;
              padding-left: 16px;
              margin: 15px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏗️ Conpanion</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              ${content}
              ${actionUrl ? `<p><a href="${actionUrl}" class="button">${actionText || 'View Details'}</a></p>` : ''}
            </div>
            <div class="footer">
              <p>You're receiving this notification based on your preferences.</p>
              <p><a href="${baseUrl}/protected/settings/notifications">Manage Notifications</a> | <a href="${baseUrl}">Visit Conpanion</a></p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Hi ${userName},\n\n${notificationMessage}\n\n${actionUrl ? `View details: ${actionUrl}\n\n` : ''}Manage notifications: ${baseUrl}/protected/settings/notifications\nVisit Conpanion: ${baseUrl}`,
  });

  // Generate content based on notification type
  switch (notificationType) {
    case 'task_assigned':
      return {
        subject: `New Task Assigned: ${notificationData?.task_title || 'Task'}`,
        ...emailTemplate(
          `<h2>📝 New Task Assignment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <div class="priority-high">
             <p><strong>Action Required:</strong> A new task has been assigned to you and needs your attention.</p>
           </div>`,
          `${baseUrl}/protected/tasks/${entityId}`,
          'View Task',
        ),
      };

    case 'task_comment':
      return {
        subject: `New Comment: ${notificationData?.task_title || 'Task'}`,
        ...emailTemplate(
          `<h2>💬 New Comment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          `${baseUrl}/protected/tasks/${notificationData?.task_id}#comment-${entityId}`,
          'View Comment',
        ),
      };

    case 'comment_mention':
      return {
        subject: `You were mentioned in: ${notificationData?.task_title || 'Task'}`,
        ...emailTemplate(
          `<h2>👤 You Were Mentioned</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <div class="priority-high">
             <p><strong>Your attention is requested</strong> in this conversation.</p>
           </div>`,
          `${baseUrl}/protected/tasks/${notificationData?.task_id}#comment-${entityId}`,
          'View Mention',
        ),
      };

    case 'approval_requested':
      return {
        subject: `🚨 Approval Required: ${notificationData?.entity_title || 'Item'}`,
        ...emailTemplate(
          `<h2>✋ Approval Required</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <div class="priority-critical">
             <p><strong>⚠️ Action Required:</strong> Your approval is needed to proceed with this request.</p>
           </div>`,
          `${baseUrl}/protected/approvals/${entityId}`,
          'Review & Approve',
        ),
      };

    case 'approval_status_changed':
      return {
        subject: `Approval Update: ${notificationData?.entity_title || 'Request'}`,
        ...emailTemplate(
          `<h2>✅ Approval Status Update</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          `${baseUrl}/protected/approvals/${entityId}`,
          'View Update',
        ),
      };

    case 'organization_added':
      return {
        subject: `Welcome to ${notificationData?.organization_name || 'Organization'}`,
        ...emailTemplate(
          `<h2>🏢 Organization Invitation</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <p>Welcome to the team! You now have access to collaborate on projects and tasks.</p>`,
          entityId ? `${baseUrl}/protected/organizations/${entityId}` : `${baseUrl}/protected`,
          'Explore Organization',
        ),
      };

    case 'project_added':
      return {
        subject: `Added to Project: ${notificationData?.project_name || 'Project'}`,
        ...emailTemplate(
          `<h2>📁 Project Invitation</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <p>You're now part of this project and can start collaborating with the team.</p>`,
          entityId ? `${baseUrl}/protected/projects/${entityId}` : `${baseUrl}/protected`,
          'View Project',
        ),
      };

    case 'task_updated':
      return {
        subject: `Task Updated: ${notificationData?.task_title || 'Task'}`,
        ...emailTemplate(
          `<h2>🔄 Task Status Update</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          `${baseUrl}/protected/tasks/${entityId}`,
          'View Task',
        ),
      };

    case 'task_unassigned':
      return {
        subject: `Task Unassigned: ${notificationData?.task_title || 'Task'}`,
        ...emailTemplate(
          `<h2>❌ Task Unassignment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          entityId ? `${baseUrl}/protected/tasks/${entityId}` : `${baseUrl}/protected/tasks`,
          'View Tasks',
        ),
      };

    case 'form_assigned':
      return {
        subject: `Form Assigned: ${notificationData?.form_title || 'Form'}`,
        ...emailTemplate(
          `<h2>📋 Form Assignment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>
           <div class="priority-high">
             <p><strong>Action Required:</strong> A form has been assigned to you for completion.</p>
           </div>`,
          `${baseUrl}/protected/forms/${entityId}`,
          'Complete Form',
        ),
      };

    case 'form_unassigned':
      return {
        subject: `Form Unassigned: ${notificationData?.form_title || 'Form'}`,
        ...emailTemplate(
          `<h2>📄 Form Unassignment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          entityId ? `${baseUrl}/protected/forms/${entityId}` : `${baseUrl}/protected/forms`,
          'View Forms',
        ),
      };

    case 'entity_assigned':
      return {
        subject: `New Assignment: ${notificationData?.entity_title || 'Item'}`,
        ...emailTemplate(
          `<h2>📌 New Assignment</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          entityId ? `${baseUrl}/protected/${entityType}s/${entityId}` : `${baseUrl}/protected`,
          'View Assignment',
        ),
      };

    case 'system':
      return {
        subject: `System Notice: ${notificationTitle}`,
        ...emailTemplate(
          `<h2>🔔 System Notification</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          notificationData?.action_url,
          'View Details',
        ),
      };

    default:
      return {
        subject: notificationTitle,
        ...emailTemplate(
          `<h2>🔔 Notification</h2>
           <p><strong>${notificationTitle}</strong></p>
           <p>${notificationMessage}</p>`,
          entityId && entityType ? `${baseUrl}/protected/${entityType}s/${entityId}` : undefined,
        ),
      };
  }
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-email-notification' \
    --header 'Authorization: Bearer [SERVICE_ROLE_KEY]' \
    --header 'Content-Type: application/json'

*/
