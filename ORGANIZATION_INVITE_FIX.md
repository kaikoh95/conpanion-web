# Organization Invite Flow Fix for Previously Removed Users

## Problem Statement

The organization invitation system had a critical bug where users who were previously removed from an organization (status = `'deactivated'`) could not be re-invited. This occurred because:

1. **Invitation Function Issue**: The `invite_user_to_organization_by_email` function only checked for active members (`status = 'active'`) but didn't handle users with `status = 'deactivated'`
2. **Acceptance Function Issue**: The `accept_organization_invitation` function tried to INSERT new memberships instead of reactivating existing deactivated ones, potentially causing constraint violations

## Root Cause Analysis

### 1. Invitation Flow (`invite_user_to_organization_by_email`)

**Original problematic code:**
```sql
-- Check if user is already a member
IF EXISTS (
  SELECT 1 FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = v_existing_user_id
  AND status = 'active'  -- Only checked for active users!
) THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', 'User is already a member of this organization',
    'error_code', 'ALREADY_MEMBER'
  );
END IF;
```

**Issue**: This check ignored users with `status = 'deactivated'`, so invitations could be created but the acceptance flow would fail.

### 2. Acceptance Flow (`accept_organization_invitation`)

**Original problematic code:**
```sql
-- Check if user is already a member
SELECT * INTO v_existing_membership
FROM public.organization_users
WHERE organization_id = v_invitation.organization_id
AND user_id = v_user_id
AND status = 'active';  -- Only looked for active members

-- Later: Always tried to INSERT new membership
INSERT INTO public.organization_users (...)
```

**Issue**: This would try to INSERT a new membership record even if a deactivated one existed, causing potential constraint violations.

## Solution Implemented

I've created a migration file: `supabase/migrations/20250707091451_fix_organization_invite_previously_removed_users.sql`

### Key Changes

#### 1. Enhanced `invite_user_to_organization_by_email`

- **Now checks for ANY existing membership** (active, deactivated, pending)
- **Handles all membership states appropriately**:
  - `'active'` → Return error (already member)
  - `'pending'` → Return error (pending invitation exists)
  - `'deactivated'` → Allow new invitation (will be reactivated on acceptance)
- **Provides better feedback** with `was_previously_member` flag and contextual messages

#### 2. Enhanced `accept_organization_invitation`

- **Reactivates deactivated memberships** instead of creating new ones
- **Handles all existing membership scenarios**:
  - `'active'` → Mark invitation accepted, return error
  - `'deactivated'` → Reactivate membership with new role
  - `'pending'` → Convert to active
  - No membership → Create new one
- **Provides better feedback** with `was_reactivated` flag

### New Features Added

#### Enhanced Return Values

**Invitation function now returns:**
```json
{
  "success": true,
  "user_exists": true,
  "token": "uuid-token",
  "invitation_id": 123,
  "was_previously_member": true,  // NEW
  "message": "Invitation sent to previously removed user"  // ENHANCED
}
```

**Acceptance function now returns:**
```json
{
  "success": true,
  "organization_id": 456,
  "role": "member",
  "message": "Invitation accepted successfully - membership reactivated",  // ENHANCED
  "was_reactivated": true  // NEW
}
```

## Implementation Details

### Database Changes

1. **No schema changes** - uses existing tables and columns
2. **Backward compatible** - existing functionality unchanged
3. **Enhanced logic** - better handling of edge cases

### User Experience Improvements

1. **Clear messaging** when inviting previously removed users
2. **Proper reactivation** of memberships on acceptance
3. **Audit trail preserved** - keeps historical data intact
4. **Role updates** - invitation role is applied when reactivating

## How to Apply the Fix

### Option 1: Direct Migration Application

If you have Supabase CLI linked to your project:

```bash
npx supabase db push
```

### Option 2: Manual Application

1. **Connect to your Supabase database** (Dashboard → Database → SQL Editor)
2. **Copy the contents** of `supabase/migrations/20250707091451_fix_organization_invite_previously_removed_users.sql`
3. **Execute the migration** in the SQL Editor

### Option 3: Production Deployment

If using automated deployments:
```bash
# The migration file is already created and will be applied on next deployment
git add supabase/migrations/20250707091451_fix_organization_invite_previously_removed_users.sql
git commit -m "Fix organization invite flow for previously removed users"
git push origin main
```

## Testing the Fix

### Test Scenario 1: Invite Previously Removed User

1. **Remove a user** from an organization (their status becomes `'deactivated'`)
2. **Try to re-invite** the same user
3. **Expected result**: Invitation should be sent successfully with message "Invitation sent to previously removed user"

### Test Scenario 2: Accept Invitation as Previously Removed User

1. **User accepts the invitation** via email link
2. **Expected result**: Membership should be reactivated with message "Invitation accepted successfully - membership reactivated"
3. **Verify**: User should have `status = 'active'` and the new role from the invitation

### Test Scenario 3: UI Verification

1. **Check the members page** after reactivation
2. **Expected result**: User should appear in active members list, not pending invitations
3. **Verify**: User should have access to the organization immediately

## Monitoring and Verification

### Database Queries to Verify Fix

**Check for deactivated users who can be re-invited:**
```sql
SELECT 
  ou.id,
  ou.user_id,
  ou.organization_id,
  ou.status,
  ou.left_at,
  up.email
FROM organization_users ou
JOIN user_profiles up ON up.id = ou.user_id
WHERE ou.status = 'deactivated'
ORDER BY ou.left_at DESC;
```

**Check invitation acceptance success:**
```sql
SELECT 
  oi.email,
  oi.status,
  oi.accepted_at,
  ou.status as membership_status,
  ou.role
FROM organization_invitations oi
LEFT JOIN organization_users ou ON ou.organization_id = oi.organization_id 
  AND ou.user_id IN (
    SELECT id FROM auth.users WHERE email = oi.email
  )
WHERE oi.status = 'accepted'
ORDER BY oi.accepted_at DESC;
```

## Benefits of This Fix

1. **Resolves the core issue** - Previously removed users can now be re-invited
2. **Maintains data integrity** - No duplicate memberships created
3. **Preserves audit trail** - Historical membership data kept
4. **Better user experience** - Clear messaging and smooth flow
5. **Backward compatible** - No breaking changes to existing functionality

## Error Handling

The fix includes comprehensive error handling for:

- **Authentication issues** - Clear auth required messages
- **Permission problems** - Proper role-based access control
- **Invalid invitations** - Expired/invalid token handling
- **Rate limiting** - Existing rate limits preserved
- **Constraint violations** - Prevented through proper logic flow

## Security Considerations

- **No security regressions** - All existing security checks maintained
- **Role validation** - Proper role hierarchy enforcement
- **Permission checks** - Only admins/owners can invite users
- **Rate limiting** - Existing protections remain in place

---

## Summary

This fix resolves the critical issue where previously removed users couldn't be re-invited to organizations. The solution:

1. ✅ **Handles deactivated memberships** properly
2. ✅ **Reactivates memberships** instead of creating duplicates  
3. ✅ **Provides better user feedback** with enhanced messaging
4. ✅ **Maintains backward compatibility** with existing functionality
5. ✅ **Preserves data integrity** and audit trails

The migration is ready to apply and will immediately fix the organization invite flow for previously removed users.