import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface InvitationRequest {
  organizationId: number;
  email: string;
  role: string;
}

interface InvitationResponse {
  success: boolean;
  userExists: boolean;
  invitationType: 'existing_user' | 'new_user';
  token?: string;
  message: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Authentication required',
          error_code: 'AUTH_REQUIRED',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Parse request body
    const { organizationId, email, role }: InvitationRequest = await req.json();

    // Validate input
    if (!organizationId || !email || !role) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: organizationId, email, role',
          error_code: 'MISSING_FIELDS',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid email format',
          error_code: 'INVALID_EMAIL',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'guest'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid role. Must be one of: owner, admin, member, guest',
          error_code: 'INVALID_ROLE',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Call the database function to create the invitation
    const { data: invitationResult, error: invitationError } = await supabaseClient.rpc(
      'invite_user_to_organization_by_email',
      {
        p_organization_id: organizationId,
        p_email: email,
        p_role: role,
      },
    );

    if (invitationError) {
      console.error('Invitation creation error:', invitationError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create invitation',
          error_code: 'INVITATION_CREATION_FAILED',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Check if invitation creation was successful
    if (!invitationResult?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: invitationResult?.error || 'Failed to create invitation',
          error_code: invitationResult?.error_code || 'INVITATION_FAILED',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Get organization details for email
    const { data: orgData, error: orgError } = await supabaseClient
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    if (orgError || !orgData) {
      console.error('Organization fetch error:', orgError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Organization not found',
          error_code: 'ORGANIZATION_NOT_FOUND',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Get inviter details
    const { data: inviterData, error: inviterError } = await supabaseClient
      .from('user_profiles')
      .select('first_name, last_name, email')
      .eq('id', user.id)
      .single();

    const inviterName =
      inviterData?.first_name && inviterData?.last_name
        ? `${inviterData.first_name} ${inviterData.last_name}`
        : inviterData?.email || user.email || 'Someone';

    // Send email using Resend
    const emailData = {
      email: email,
      organizationName: orgData.name,
      invitationToken: invitationResult.token,
      inviterName: inviterName,
      role: role,
      userExists: invitationResult.user_exists,
    };

    const emailResult = await sendInvitationEmail(emailData);

    if (!emailResult.success) {
      console.error('Email sending failed:', emailResult.error);
      // Note: We don't return an error here because the invitation was created successfully
      // The user can still accept the invitation via direct link
    }

    // Return success response
    const response: InvitationResponse = {
      success: true,
      userExists: invitationResult.user_exists,
      invitationType: invitationResult.user_exists ? 'existing_user' : 'new_user',
      token: invitationResult.token,
      message: invitationResult.user_exists
        ? 'Invitation sent to existing user'
        : 'Signup invitation sent to new user',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

// Email sending function using Resend
async function sendInvitationEmail(data: {
  email: string;
  organizationName: string;
  invitationToken: string;
  inviterName: string;
  role: string;
  userExists: boolean;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL =
      Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@approval.getconpanion.com';
    const APP_URL = Deno.env.get('APP_URL') || 'https://www.getconpanion.com';

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    const invitationUrl = `${APP_URL}/invitation/${data.invitationToken}`;

    const emailPayload = {
      from: FROM_EMAIL,
      to: [data.email],
      subject: `You're invited to join ${data.organizationName} on Conpanion`,
      html: generateEmailTemplate(data, invitationUrl),
      text: generateEmailText(data, invitationUrl),
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Resend API error: ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    console.error('Email sending error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// Generate HTML email template
function generateEmailTemplate(
  data: {
    email: string;
    organizationName: string;
    inviterName: string;
    role: string;
    userExists: boolean;
  },
  invitationUrl: string,
): string {
  const ctaText = data.userExists ? 'Accept Invitation' : 'Create Account & Join Organization';
  const userMessage = data.userExists
    ? 'Since you already have a Conpanion account, you can accept this invitation right away and start collaborating with your team.'
    : "Conpanion is a project management platform designed specifically for construction companies. You'll be able to collaborate on projects, manage tasks, track progress, and much more.";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${data.organizationName} on Conpanion</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f8fafc;
    }
    @media only screen and (max-width: 600px) {
      body {
        padding: 10px;
      }
      .container {
        padding: 24px !important;
      }
      .cta-button {
        min-width: 100% !important;
        padding: 18px 24px !important;
        font-size: 16px !important;
        box-sizing: border-box;
      }
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 10px;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
      margin: 20px 0;
    }
    .invitation-details {
      background-color: #f3f4f6;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
      text-align: center;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
      transition: all 0.3s ease;
      border: none;
      min-width: 280px;
    }
    .cta-button:hover {
      background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
      transform: translateY(-1px);
    }
    .cta-button:active {
      transform: translateY(0px);
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
    .expiry-note {
      background-color: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 4px;
      padding: 12px;
      margin: 15px 0;
      font-size: 14px;
      color: #92400e;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Conpanion</div>
      <h1 class="title">You're invited to join ${data.organizationName}</h1>
    </div>
    
    <p>Hi there,</p>
    
    <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> on Conpanion as a <strong>${data.role}</strong>.</p>
    
    <div class="invitation-details">
      <p><strong>Organization:</strong> ${data.organizationName}</p>
      <p><strong>Role:</strong> ${data.role}</p>
      <p><strong>Invited by:</strong> ${data.inviterName}</p>
    </div>
    
    <p>${userMessage}</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${invitationUrl}" class="cta-button">${ctaText}</a>
    </div>
    
    <div class="expiry-note">
      <strong>⏰ This invitation expires in 7 days.</strong> Make sure to accept it before then!
    </div>
    
    <p>If you have any questions, feel free to reach out to ${data.inviterName} or our support team.</p>
    
    <div class="footer">
      <p>This invitation was sent to ${data.email}. If you weren't expecting this invitation, you can safely ignore this email.</p>
      <p>© 2024 Conpanion. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate plain text email
function generateEmailText(
  data: {
    email: string;
    organizationName: string;
    inviterName: string;
    role: string;
    userExists: boolean;
  },
  invitationUrl: string,
): string {
  const ctaText = data.userExists
    ? 'Accept your invitation:'
    : 'Create your account and join the organization:';
  const userMessage = data.userExists
    ? 'Since you already have a Conpanion account, you can accept this invitation right away and start collaborating with your team.'
    : "Conpanion is a project management platform designed specifically for construction companies. You'll be able to collaborate on projects, manage tasks, track progress, and much more.";

  return `
You're invited to join ${data.organizationName} on Conpanion

Hi there,

${data.inviterName} has invited you to join ${data.organizationName} on Conpanion as a ${data.role}.

Organization: ${data.organizationName}
Role: ${data.role}
Invited by: ${data.inviterName}

${userMessage}

${ctaText}
${invitationUrl}

⏰ This invitation expires in 7 days. Make sure to accept it before then!

If you have any questions, feel free to reach out to ${data.inviterName} or our support team.

This invitation was sent to ${data.email}. If you weren't expecting this invitation, you can safely ignore this email.

© 2024 Conpanion. All rights reserved.
  `;
}
