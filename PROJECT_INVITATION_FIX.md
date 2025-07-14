# Fix for Project Invitation Auth Schema Query Error

## Problem Statement

When trying to invite users to a project, the following error occurred:

```
Failed to find user: relation "public.auth.users" does not exist
```

## Root Cause

The issue was in `lib/api/projects.ts` in the `inviteUserToProject` method. The code was attempting to query the `auth.users` table directly from the client:

```typescript
// INCORRECT - This was the problematic code
const { data: users, error: userError } = await this.supabase
  .from('auth.users') // ❌ This tries to query public.auth.users
  .select('id')
  .eq('email', userEmail)
  .limit(1);
```

### Why This Failed

1. **Schema Misinterpretation**: When using `.from('auth.users')`, Supabase client interprets this as looking for a table named `auth.users` in the `public` schema (i.e., `public.auth.users`), not the `auth.users` table in the `auth` schema.

2. **Security Restrictions**: The `auth.users` table is not directly accessible from client-side queries for security reasons. It's part of Supabase's authentication system and requires special permissions.

3. **Database Function Availability**: The codebase already had proper database functions designed for this purpose:
   - `check_user_exists_by_email(user_email TEXT)`
   - `get_user_id_by_email(user_email TEXT)`

## Solution Implemented

Replaced the direct auth table query with the proper database functions:

```typescript
// CORRECT - Fixed implementation
// First check if user exists using the proper database function
const { data: userExists, error: userExistsError } = await this.supabase.rpc(
  'check_user_exists_by_email',
  { user_email: userEmail },
);

if (userExistsError) {
  throw new Error(`Failed to check user existence: ${userExistsError.message}`);
}

if (!userExists) {
  throw new Error('User not found with that email address');
}

// Get the user ID using the proper database function
const { data: userId, error: userIdError } = await this.supabase.rpc('get_user_id_by_email', {
  user_email: userEmail,
});

if (userIdError) {
  throw new Error(`Failed to get user ID: ${userIdError.message}`);
}

if (!userId) {
  throw new Error('Unable to retrieve user ID for the email address');
}
```

## Benefits of the Fix

1. **✅ Proper Security**: Uses approved database functions instead of attempting direct auth table access
2. **✅ Better Error Handling**: More specific error messages for different failure scenarios
3. **✅ Consistent with Codebase**: Uses the same pattern as organization invitations
4. **✅ Reliable**: No more schema interpretation issues

## How to Test

1. **Try inviting an existing user to a project**:

   - Go to project settings → Members
   - Enter an email of an existing user
   - Click invite
   - **Expected**: Should work without the auth schema error

2. **Try inviting a non-existent user**:

   - Enter an email that doesn't exist in the system
   - **Expected**: Should show "User not found with that email address"

3. **Verify the invitation process**:
   - After successful invitation, check that the user appears in the project members list
   - **Expected**: User should be added with the correct role

## Key Learnings

1. **Never query auth tables directly** from client-side code
2. **Use database functions** that are specifically designed for user lookups
3. **Follow existing patterns** - the organization invitation system already had the correct approach
4. **Security first** - Always use proper authentication and authorization patterns

## Related Functions

The following database functions are available for user operations:

- `check_user_exists_by_email(user_email TEXT)` - Returns boolean
- `get_user_id_by_email(user_email TEXT)` - Returns UUID
- `invite_user_to_project(p_project_id INTEGER, p_user_id UUID, p_role TEXT)` - Creates project membership

---

**Status**: ✅ **Fixed** - Project invitations now work correctly without auth schema errors.
