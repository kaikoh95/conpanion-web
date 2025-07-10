import { Resend } from 'resend';

// Email service configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notifications@approval.getconpanion.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.getconpanion.com';

export interface EmailInvitationData {
  email: string;
  organizationName: string;
  invitationToken: string;
  inviterName: string;
  role: string;
  userExists: boolean;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private resend: Resend;

  constructor() {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }
    this.resend = new Resend(RESEND_API_KEY);
  }

  /**
   * Send organization invitation email to a new user (needs to sign up)
   */
  async sendOrganizationInvitationToNewUser(data: EmailInvitationData): Promise<EmailResult> {
    try {
      const invitationUrl = `${APP_URL}/invitation/${data.invitationToken}`;

      const { data: result, error } = await this.resend.emails.send({
        from: FROM_EMAIL,
        to: [data.email],
        subject: `You're invited to join ${data.organizationName} on Conpanion`,
        html: this.generateNewUserEmailTemplate(data, invitationUrl),
        text: this.generateNewUserEmailText(data, invitationUrl),
      });

      if (error) {
        console.error('Resend error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }

      return {
        success: true,
        messageId: result?.id,
      };
    } catch (error) {
      console.error('Email service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send organization invitation email to an existing user
   */
  async sendOrganizationInvitationToExistingUser(data: EmailInvitationData): Promise<EmailResult> {
    try {
      const invitationUrl = `${APP_URL}/invitation/${data.invitationToken}`;

      const { data: result, error } = await this.resend.emails.send({
        from: FROM_EMAIL,
        to: [data.email],
        subject: `You're invited to join ${data.organizationName} on Conpanion`,
        html: this.generateExistingUserEmailTemplate(data, invitationUrl),
        text: this.generateExistingUserEmailText(data, invitationUrl),
      });

      if (error) {
        console.error('Resend error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }

      return {
        success: true,
        messageId: result?.id,
      };
    } catch (error) {
      console.error('Email service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Generate HTML email template for new users
   */
  private generateNewUserEmailTemplate(data: EmailInvitationData, invitationUrl: string): string {
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
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #1d4ed8;
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
    
    <p>Conpanion is a project management platform designed specifically for construction companies. You'll be able to collaborate on projects, manage tasks, track progress, and much more.</p>
    
    <div style="text-align: center;">
      <a href="${invitationUrl}" class="cta-button">Create Account & Join Organization</a>
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

  /**
   * Generate HTML email template for existing users
   */
  private generateExistingUserEmailTemplate(
    data: EmailInvitationData,
    invitationUrl: string,
  ): string {
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
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #1d4ed8;
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
    
    <p>Since you already have a Conpanion account, you can accept this invitation right away and start collaborating with your team.</p>
    
    <div style="text-align: center;">
      <a href="${invitationUrl}" class="cta-button">Accept Invitation</a>
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

  /**
   * Generate plain text email for new users
   */
  private generateNewUserEmailText(data: EmailInvitationData, invitationUrl: string): string {
    return `
You're invited to join ${data.organizationName} on Conpanion

Hi there,

${data.inviterName} has invited you to join ${data.organizationName} on Conpanion as a ${data.role}.

Organization: ${data.organizationName}
Role: ${data.role}
Invited by: ${data.inviterName}

Conpanion is a project management platform designed specifically for construction companies. You'll be able to collaborate on projects, manage tasks, track progress, and much more.

Create your account and join the organization:
${invitationUrl}

⏰ This invitation expires in 7 days. Make sure to accept it before then!

If you have any questions, feel free to reach out to ${data.inviterName} or our support team.

This invitation was sent to ${data.email}. If you weren't expecting this invitation, you can safely ignore this email.

© 2024 Conpanion. All rights reserved.
    `;
  }

  /**
   * Generate plain text email for existing users
   */
  private generateExistingUserEmailText(data: EmailInvitationData, invitationUrl: string): string {
    return `
You're invited to join ${data.organizationName} on Conpanion

Hi there,

${data.inviterName} has invited you to join ${data.organizationName} on Conpanion as a ${data.role}.

Organization: ${data.organizationName}
Role: ${data.role}
Invited by: ${data.inviterName}

Since you already have a Conpanion account, you can accept this invitation right away and start collaborating with your team.

Accept your invitation:
${invitationUrl}

⏰ This invitation expires in 7 days. Make sure to accept it before then!

If you have any questions, feel free to reach out to ${data.inviterName} or our support team.

This invitation was sent to ${data.email}. If you weren't expecting this invitation, you can safely ignore this email.

© 2024 Conpanion. All rights reserved.
    `;
  }
}

// Export a singleton instance
export const emailService = new EmailService();
