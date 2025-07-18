# Approval Notification Field Reference Fix

## Problem

When creating approvals, users were getting the error:

```
record "new" has no field "created_by"
```

## Root Cause

The previous migration `20250718021838_exclude_action_performers_from_notifications.sql` incorrectly referenced `NEW.created_by` in the approval notification triggers, but the `approvals` table doesn't have a `created_by` field.

## Actual Approvals Table Schema

The `approvals` table has these relevant fields:

- `requester_id` - Who requested the approval
- `user_id` - Who last updated the approval
- `action_taken_by` - Who performed the last action (added later)

## Solution

Migration `20250718022229_fix_approval_notification_field_references.sql` fixes the field references:

### For INSERT Operations (new approval requests):

- **Creator**: `NEW.requester_id` (person who requested approval)
- **Notifications**: Requester gets confirmation, approvers get notification

### For UPDATE Operations (status changes):

- **Updater**: `COALESCE(NEW.action_taken_by, NEW.user_id)` (whoever made the change)
- **Notifications**: Only notify requester if they didn't make the change themselves

## Key Changes

1. ✅ Fixed `p_created_by => NEW.requester_id` for INSERT operations
2. ✅ Fixed `p_created_by => v_changed_by` for UPDATE operations
3. ✅ Added logic to determine who made the change using `action_taken_by` or `user_id`
4. ✅ Maintained exclusion logic to prevent self-notifications

## Status

- **Issue**: ❌ `record "new" has no field "created_by"`
- **Fix**: ✅ Use correct field names from actual schema
- **Regression Risk**: ✅ Low - maintains existing functionality with correct field references

## How to Apply

```bash
npx supabase db push
```

This fix ensures approval notifications work correctly without introducing any regressions to the existing notification exclusion logic.
