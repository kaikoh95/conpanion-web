# Organization Invitation Feature Implementation Plan

## Progress Tracker

Use these emojis to track implementation progress:

- 🔴 **Not Started** - Task not yet begun
- 🟡 **In Progress** - Currently working on this task
- 🟢 **Completed** - Task finished and tested
- ⚠️ **Blocked** - Task blocked by dependencies or issues
- 🔄 **Review** - Task completed but needs review/testing

## Overview

This feature enables inviting users to organizations with two distinct flows:

1. **Existing Users**: Users who already have accounts - send invitation notification
2. **New Users**: Users who don't have accounts - send signup invitation email via Resend

## Current State Analysis

- ✅ Database schema exists with `organization_users` table supporting `pending` status
- ✅ Basic invite dialog UI exists but is disabled
- ✅ Database functions exist for checking user existence and creating invitations
- ❌ No email sending functionality (Resend not installed)
- ❌ No user existence checking in UI
- ❌ No invitation acceptance/decline flow
- ❌ No new user signup with invitation context

## Implementation Steps

### Phase 1: Database & API Foundation ✅ COMPLETED

#### 🟢 Step 1.1: Initial Organization Invitation System ✅

**File**: `supabase/migrations/20250621040355_create_organization_invitation_system_complete.sql`

- ✅ Add `invitation_token`, `invitation_expires_at`, `invitation_email`, `resend_count`, `last_resend_at` columns
- ✅ Create indexes for fast lookups and performance optimization
- ✅ Create `check_user_exists_by_email` and `get_user_id_by_email` functions
- ✅ Create initial invitation functions

#### 🟢 Step 1.2: Refactor to Separate Invitations Table ✅

**File**: `supabase/migrations/20250621085849_create_organization_invitations_table.sql`

- ✅ Create dedicated `organization_invitations` table with complete lifecycle tracking
- ✅ Remove invitation columns from `organization_users` table (cleaner separation)
- ✅ Update all invitation functions to use new table structure:
  - `invite_user_to_organization_by_email()` - Enhanced with separate table
  - `accept_organization_invitation(token)` - Creates membership after acceptance
  - `decline_organization_invitation(token)` - Tracks declined invitations
  - `get_invitation_by_token(token)` - Retrieve invitation details
  - `cancel_organization_invitation(id)` - Delete pending invitations
  - `get_pending_organization_invitations(org_id)` - List pending invitations
  - `cleanup_expired_invitations()` - Mark expired invitations
- ✅ Comprehensive RLS policies for security
- ✅ Proper indexes and constraints for performance
- ✅ Full audit trail with status tracking (pending/accepted/declined/expired)

### Phase 2: Email Integration ✅ COMPLETED

#### 🟢 Step 2.1: Install and Configure Resend ✅

**Files**: `package.json`, environment variables

- ✅ Install Resend: `npm install resend`
- ✅ Add environment variables:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL` (defaults to `notifications@approval.getconpanion.com`)
  - `NEXT_PUBLIC_APP_URL` (defaults to `https://www.getconpanion.com`)

#### 🟢 Step 2.2: Create Email Service ✅

**File**: `lib/services/email.ts`

- ✅ Create `EmailService` class with Resend integration
- ✅ Methods:
  - `sendOrganizationInvitationToNewUser(email, organizationName, invitationToken)`
  - `sendOrganizationInvitationToExistingUser(email, organizationName, invitationToken)`
- ✅ Create responsive email templates (HTML + text versions)
- ✅ Professional Conpanion branding and styling
- ✅ Different templates for new vs existing users

#### 🟢 Step 2.3: Create Supabase Edge Function for Email Sending ✅

**Files**: `supabase/functions/send-organization-invitation/index.ts`, `supabase/functions/_shared/cors.ts`

- ✅ Handle invitation email sending with full validation
- ✅ Validate permissions (caller must be admin/owner)
- ✅ Call database functions and Resend API
- ✅ Rate limiting integrated with database functions
- ✅ Comprehensive error handling and logging
- ✅ Return detailed success/failure status
- ✅ Support for both new and existing users
- ✅ CORS support for web app integration

### Phase 3: API Layer Updates ✅ COMPLETED

#### 🟢 Step 3.1: Update Organization API ✅

**File**: `lib/api/organizations.ts`

- ✅ Add `checkUserExistsByEmail(email: string): Promise<UserExistsResponse>`
- ✅ Add `inviteUserByEmail(orgId: number, email: string, role: InvitationRole): Promise<InvitationResult>`
- ✅ Add `getInvitationByToken(token: string): Promise<InvitationDetails>`
- ✅ Add `acceptInvitation(token: string): Promise<InvitationActionResponse>`
- ✅ Add `declineInvitation(token: string): Promise<InvitationActionResponse>`
- ✅ Add `getPendingInvitations(orgId: number): Promise<InvitationListResponse>`
- ✅ Add `cancelInvitation(invitationId: number): Promise<InvitationActionResponse>`
- ✅ Add `resendInvitation(orgId: number, email: string, role: InvitationRole): Promise<InvitationResult>`
- ✅ Integrated with Supabase Edge Function for email sending
- ✅ Comprehensive error handling and session management

#### 🟢 Step 3.2: Create Invitation Types ✅

**File**: `lib/types/invitation.ts`

- ✅ Complete TypeScript interfaces for invitation system:
  - `InvitationResult` - Response from invitation creation
  - `InvitationDetails` - Full invitation information
  - `PendingInvitation` - Invitation list item
  - `InvitationListResponse` - Response for invitation lists
  - `InvitationActionResponse` - Response for invitation actions
  - `UserExistsResponse` - Response for user existence check
  - `InvitationRole` - Type-safe role definitions

### Phase 4: UI Components ✅ COMPLETED

#### 🟢 Step 4.1: Create Invitation Acceptance Pages ✅

**Files**:

- ✅ `app/invitation/[token]/page.tsx` - Main invitation landing page
- ✅ `app/invitation/[token]/success/page.tsx` - Success page after acceptance
- ✅ `app/invitation/[token]/declined/page.tsx` - Declined confirmation page
- ✅ `app/invitation/[token]/not-found.tsx` - Invalid token handling
- ✅ `app/api/invitations/[token]/accept/route.ts` - Accept API endpoint
- ✅ `app/api/invitations/[token]/decline/route.ts` - Decline API endpoint

#### 🟢 Step 4.2: Enhanced Authentication Pages ✅

**Files**:

- ✅ `app/(auth-pages)/sign-up/page.tsx` - Enhanced with invitation context
- ✅ `app/(auth-pages)/sign-in/page.tsx` - Enhanced with invitation token handling

#### 🟢 Step 4.3: Invitation Page Features ✅

- ✅ Public page (no auth required initially)
- ✅ Fetch invitation details by token using OrganizationAPI
- ✅ Show organization info, inviter details, and role
- ✅ Handle different states: valid, expired, invalid token, email mismatch
- ✅ For authenticated users: Accept/Decline buttons with form actions
- ✅ For non-authenticated users: Redirect to `/sign-up?invitation=[token]`
- ✅ Professional design with Conpanion branding
- ✅ Mobile-responsive design
- ✅ Loading states with skeleton UI
- ✅ Error handling with URL parameters

#### 🟢 Step 4.4: Update Invite Dialog ✅

**File**: `app/protected/settings/organizations/[slug]/members/page.tsx`

- ✅ Add real-time user existence checking with debounced API calls (500ms)
- ✅ Show status messages:
  - "✅ User exists - invitation will be sent"
  - "⚠️ User doesn't exist - signup invitation will be sent"
- ✅ Update `handleInviteMember` to use new OrganizationAPI.inviteUserByEmail()
- ✅ Add loading states and error handling
- ✅ Enhanced success messages with invitation type context
- ✅ Proper form state management and cleanup

### Phase 5: Authentication Flow Updates ✅ COMPLETED

#### 🟢 Step 5.1: Enhance Existing Sign-up Action ✅

**File**: `app/actions.ts`

- ✅ Extended `signUpAction` to handle invitation tokens from form data
- ✅ Accept invitation token via hidden form field
- ✅ Enhanced email redirect URL to include invitation token
- ✅ Improved success messages with invitation context
- ✅ Enhanced `signInAction` to handle invitation tokens and redirect appropriately

#### 🟢 Step 5.2: Enhance Existing Sign-up Page ✅ (Completed in Phase 4)

**File**: `app/(auth-pages)/sign-up/page.tsx`

- ✅ Check for `invitation` URL parameter
- ✅ Pre-populate email from invitation details
- ✅ Show organization context when invitation present
- ✅ Pass invitation token to enhanced `signUpAction`

#### 🟢 Step 5.3: Update Auth Callback ✅

**File**: `app/auth/callback/route.ts`

- ✅ Handle invitation context in callback
- ✅ Redirect to invitation acceptance page if token present
- ✅ Maintain existing redirect behavior for non-invitation flows

#### 🟢 Step 5.4: Enhanced Success Flow ✅

**Files**: `app/invitation/[token]/success/page.tsx`, `app/api/invitations/[token]/accept/route.ts`

- ✅ Success page detects post-signup flow with redirect flag
- ✅ Automatically fetches organization details and slug
- ✅ Provides direct link to organization settings page
- ✅ Improved user experience with contextual messaging

### Phase 6: Middleware & Routing ✅ COMPLETED

#### 🟢 Step 6.1: Update Middleware ✅

**File**: `utils/supabase/middleware.ts`

- ✅ Allow public access to `/invitation/*` routes
- ✅ Handle invitation token validation
- ✅ Allow public access to invitation API routes (`/api/invitations/*`)
- ✅ Validate UUID format for invitation tokens
- ✅ Return proper error responses for invalid tokens

#### 🟢 Step 6.2: Create Invitation Utilities ✅

**File**: `lib/utils/invitation-utils.ts`

- ✅ UUID validation functions
- ✅ Token extraction from URL paths
- ✅ Route validation with detailed error messages
- ✅ Invitation route detection
- ✅ Invalid invitation redirect handling

#### 🟢 Step 6.3: Create Invalid Invitation Page ✅

**File**: `app/invitation/invalid/page.tsx`

- ✅ User-friendly error page for malformed tokens
- ✅ Clear explanation of possible causes
- ✅ Action buttons to sign in or create account
- ✅ Mobile-responsive design

### Phase 7: User Experience Enhancements

#### 🟢 Step 7.1: Add Pending Invitations Management ✅

**File**: `app/protected/settings/organizations/[slug]/members/page.tsx`

- ✅ Show pending invitations section (separate from active members)
- ✅ Allow resending invitations (with rate limiting feedback)
- ✅ Allow canceling pending invitations
- ✅ Show invitation status, expiry date, and resend count
- ✅ Display invited email address for pending invitations
- ✅ Visual indicators for expired/expiring invitations
- ✅ Real-time loading states for all invitation actions
- ✅ Mobile-responsive design with proper layouts

#### 🔴 Step 7.2: Create Invitation Dashboard (OPTIONAL)

**File**: `app/protected/invitations/page.tsx`

- Show all pending invitations for current user
- Accept/decline from dashboard
- Show invitation history
  _Note: This may not be needed since users get direct email links_

#### 🟢 Step 7.3: Add Notification System ✅

**Implemented**: Dialog-based notifications in members page

- ✅ Success/error notifications for invitation actions
- ✅ Detailed error messages with context
- ✅ Confirmation dialogs for destructive actions
- ✅ Real-time feedback for all operations
  _Note: Using dialog notifications instead of toast for better UX_

### Phase 8: Email Templates ✅ COMPLETED

#### 🟢 Step 8.1: Create Email Template ✅

**Files**: `supabase/functions/send-organization-invitation/index.ts` (embedded templates)

- ✅ Single template for both new and existing users with dynamic content
- ✅ Responsive HTML design with professional styling
- ✅ Conpanion branding and color scheme
- ✅ Dynamic CTA button text based on user type:
  - "Create Account & Join Organization" for new users
  - "Accept Invitation" for existing users
- ✅ Professional styling matching Conpanion design system
- ✅ Plain text fallback versions for all templates

### Phase 9: Security & Validation

#### 🟢 Step 9.1: Add Rate Limiting (Database-based) ✅

**File**: Database functions and triggers (completed in Phase 1)

- ✅ Track invitation resend attempts in `organization_invitations` table
- ✅ `resend_count` and `last_resend_at` columns in invitations table
- ✅ Implement 3 resends per day limit per invitation
- ✅ Rate limiting logic built into invitation functions
- ✅ Automatic reset counter logic in database functions

#### 🔴 Step 9.2: Add Input Validation

**Files**: Various API endpoints

- Email format validation
- Role validation
- Organization access validation
- Token format validation

#### 🔴 Step 9.3: Add Audit Logging

**File**: `lib/utils/audit-log.ts`

- Log invitation actions
- Track acceptance/decline events
- Monitor suspicious activity

### Phase 10: Testing & Documentation

#### 🔴 Step 10.1: Create Test Cases

**Files**: Test files for each component

- Unit tests for API functions
- Integration tests for invitation flow
- E2E tests for complete user journey

#### 🔴 Step 10.2: Update Documentation

**Files**: README updates, API documentation

- Document new API endpoints
- Document environment variables
- Document invitation flow

## Technical Considerations

### Database Performance

- ✅ Index on `token` for fast lookups (organization_invitations table)
- ✅ Index on `expires_at` for cleanup queries (organization_invitations table)
- ✅ Index on `organization_id`, `email`, `status` for efficient queries
- ✅ Unique constraint on pending invitations per organization/email
- Consider partitioning for large invitation volumes (future enhancement)

### Security

- Use cryptographically secure tokens (UUID v4 or similar)
- Implement token expiration (default 7 days)
- Validate all inputs server-side
- Rate limit invitation sends

### Email Deliverability

- Use proper SPF/DKIM records
- Monitor bounce rates
- Implement unsubscribe functionality
- Handle email delivery failures gracefully

### User Experience

- Progressive enhancement for JavaScript-disabled users
- Mobile-responsive design
- Clear error messages
- Loading states for all async operations

## Success Metrics

- Invitation send success rate
- Invitation acceptance rate
- Time from invitation to acceptance
- User signup completion rate from invitations
- Email delivery success rate

## Rollback Plan

- Feature flags for gradual rollout
- Database migration rollback scripts
- Ability to disable email sending
- Fallback to manual invitation process

## Future Enhancements

- Bulk invitation (multiple emails in single form)
- Invitation analytics dashboard
- Custom invitation messages
- Integration with SSO providers
- Mobile app deep linking
- Invitation reminder emails

## Dependencies

- Resend API account and key
- Email domain verification
- Environment variable configuration
- Database migration execution
- Testing environment setup

## Estimated Timeline

- Phase 1-3: 2-3 days (Database, API, Email)
- Phase 4-6: 3-4 days (UI, Auth, Routing)
- Phase 7-8: 2-3 days (UX, Templates)
- Phase 9-10: 2-3 days (Security, Testing)
- **Total: 9-13 days**

## Requirements Confirmed ✅

1. **Invitation Expiry**: 7 days
2. **Email Domain**: `notifications@approval.getconpanion.com`
3. **Custom Messages**: Not needed - use simple, clear template
4. **Bulk Invitations**: Single email field for now (future enhancement)
5. **Reminder Emails**: Not needed
6. **Analytics**: Not needed initially
7. **Rate Limiting**: Max 3 invitation resends per day
8. **Invitation Cancellation**: Yes, from members page
9. **Organization Tiers**: Not applicable
10. **Custom Templates**: Not needed - standard template only

## Email Template (Final)

```
Subject: You're invited to join [Organization Name] on Conpanion

Hello,

[Inviter Email] has invited you to join [Organization Name] on Conpanion.

You'll need to create an account to join this organization.

[Create Account & Join Organization Button]

If you didn't expect this invitation, you can safely ignore this email.

Thanks,
The Conpanion Team
```

## Current Implementation Status

### ✅ Completed Phases:

- **Phase 1**: ✅ Database Foundation (separate `organization_invitations` table)
- **Phase 2**: ✅ Email Integration (Resend + Supabase Edge Functions)
- **Phase 3**: ✅ API Layer (comprehensive OrganizationAPI methods)
- **Phase 4**: ✅ UI Components (invitation acceptance pages + enhanced auth)
- **Phase 5**: ✅ Authentication Flow Updates (auto-redirect to invitations after signup)
- **Phase 6**: ✅ Middleware & Routing (public invitation routes + validation)
- **Phase 7**: ✅ User Experience Enhancements (pending invitations management + notifications)
- **Phase 8**: ✅ Email Templates (responsive HTML + plain text)
- **Phase 9.1**: ✅ Rate Limiting (database-based, 3 resends/day)

### 🔴 Remaining Phases:

- **Phase 9.2-9.3**: Input Validation & Audit Logging
- **Phase 10**: Testing & Documentation

### 🎯 Recently Completed: Enhanced Invitation System (Approach 2)

Implemented database-driven invitation linking system to make invitation flow more reliable and not dependent on browser URL parameters.

#### ✅ **Database Enhancements**

- **Added `user_id` column** to `organization_invitations` table
- **Created indexes** for efficient user-invitation lookups
- **New database functions**:
  - `link_user_to_pending_invitations()` - Links email-based invitations to user account
  - `get_user_pending_invitations()` - Gets all pending invitations for a user
  - `user_has_pending_invitations()` - Quick check for pending invitations

#### ✅ **API Layer Updates**

- **Enhanced OrganizationAPI** with user invitation linking methods
- **Automatic invitation linking** after signup/signin
- **Enhanced invitation acceptance** with user linking

#### ✅ **Authentication Flow Integration**

- **Sign-in action** now automatically links invitations and redirects to pending invitations
- **Auth callback** links invitations after email verification
- **Automatic detection** of pending invitations on every login

#### ✅ **How It Works Now**

1. **User gets invitation email** → Clicks link → Goes to invitation page
2. **If not authenticated** → Redirects to signup/signin (no token dependency)
3. **After authentication** → System automatically links user to their email-based invitations
4. **Automatic redirect** → User is taken to their pending invitation(s)
5. **Reliable flow** → Works regardless of how user accesses the app (direct login, browser refresh, etc.)

### 🎯 Next Priority: Apply Migration & Test

Ready to apply the database migration and test the enhanced invitation system.
