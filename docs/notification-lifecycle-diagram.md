# Notification Lifecycle State Machine

## Overview

This document illustrates the complete lifecycle of a notification from creation to completion, showing all possible states and transitions.

## State Machine Diagram

```
                           ┌─────────────┐
                           │   TRIGGER   │
                           │   EVENT     │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │  VALIDATED  │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                      ┌────│   CREATED   │────┐
                      │    └──────┬──────┘    │
                      │           │           │
                      ▼           ▼           ▼
               ┌──────────┐ ┌──────────┐ ┌──────────┐
               │  IN-APP  │ │  EMAIL   │ │   PUSH   │
               │  QUEUED  │ │  QUEUED  │ │  QUEUED  │
               └────┬─────┘ └────┬─────┘ └────┬─────┘
                    │            │            │
                    ▼            ▼            ▼
               ┌──────────┐ ┌──────────┐ ┌──────────┐
               │DELIVERING│ │DELIVERING│ │DELIVERING│
               └────┬─────┘ └────┬─────┘ └────┬─────┘
                    │            │            │
        ┌───────────┼────────────┼────────────┼───────────┐
        │           │            │            │           │
        ▼           ▼            ▼            ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │DELIVERED│ │ FAILED  │ │DELIVERED│ │ FAILED  │ │  RETRY  │
   └────┬────┘ └─────────┘ └────┬────┘ └─────────┘ └────┬────┘
        │                        │                        │
        │                        │                        │
        └────────────┬───────────┘                        │
                     │                                     │
                     ▼                                     │
              ┌─────────────┐                             │
              │   VIEWED    │◀────────────────────────────┘
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │    READ     │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │  ARCHIVED   │
              └─────────────┘
```

## State Definitions

### 1. **TRIGGER EVENT**
- Initial state when an action occurs that should generate a notification
- Examples: Task assigned, comment added, approval requested

### 2. **VALIDATED**
- Event has been validated and confirmed to require notification
- Checks: User exists, has permissions, notification type enabled

### 3. **CREATED**
- Notification record created in database
- Assigned unique ID, timestamp, and metadata

### 4. **QUEUED**
- Notification added to delivery queue for specific channel
- Separate queues for each delivery channel

### 5. **DELIVERING**
- Active delivery attempt in progress
- Channel-specific delivery logic executing

### 6. **DELIVERED**
- Successfully delivered to channel
- Delivery timestamp recorded

### 7. **FAILED**
- Delivery attempt failed
- Error details logged

### 8. **RETRY**
- Scheduled for retry after failure
- Implements exponential backoff

### 9. **VIEWED**
- User has seen the notification (opened notification panel)
- View timestamp recorded

### 10. **READ**
- User has clicked/interacted with notification
- Read timestamp recorded

### 11. **ARCHIVED**
- Notification moved to archive after configured period
- Removed from active notifications list

## Transition Rules

### Success Path
```
TRIGGER → VALIDATED → CREATED → QUEUED → DELIVERING → DELIVERED → VIEWED → READ → ARCHIVED
```

### Failure Handling
```
DELIVERING → FAILED → RETRY → DELIVERING
            └─────────────────────────┘
                  (max 3 attempts)
```

### Multi-Channel Delivery
```
        ┌─→ IN-APP QUEUE → DELIVER
CREATED ├─→ EMAIL QUEUE → DELIVER
        └─→ PUSH QUEUE → DELIVER
```

## Notification Priority Matrix

| Type | System | Organization | Task | Approval | Assignment |
|------|--------|--------------|------|----------|------------|
| Priority | Critical | High | Medium | High | Medium |
| In-App | ✓ Required | ✓ | ✓ | ✓ | ✓ |
| Email | ✓ Required | ✓ | Optional | ✓ | Optional |
| Push | Optional | ✓ | ✓ | ✓ | Optional |
| Retry | 5 attempts | 3 | 3 | 3 | 2 |

## Time-based Transitions

```
Created → Viewed:     Average 15 minutes
Viewed → Read:        Average 2 minutes
Read → Archived:      After 30 days
Failed → Retry:       1min, 2min, 4min (exponential)
```

## Bulk Operation Flows

### Bulk Task Assignment
```
                    ┌─────────────────┐
                    │  Bulk Trigger   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Batch Validator │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
          [User A]      [User B]     [User C]
                │            │            │
                └────────────┼────────────┘
                             │
                    ┌────────▼────────┐
                    │ Bulk Create     │
                    │ (Optimized)     │
                    └─────────────────┘
```

## Channel-Specific Behaviors

### In-App Notifications
- Real-time delivery via WebSocket
- No retry needed (stored in DB)
- Badge count updates immediately

### Email Notifications
- Queued for batch processing
- Template rendering
- Unsubscribe link included (except system)

### Push Notifications
- Device token validation
- Platform-specific formatting
- Silent notifications for background updates

## Notification Grouping Logic

```
Similar Notifications (within 5 minutes)
           │
           ▼
    ┌─────────────┐
    │  Grouping   │
    │   Engine    │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  Grouped    │     "You have 3 new tasks"
    │Notification │     Instead of 3 separate
    └─────────────┘
```

## Performance Optimizations

### Database Operations
```sql
-- Bulk insert for multiple notifications
INSERT INTO notifications (user_id, type, title, message, data)
SELECT * FROM (VALUES
  (user1, 'task_assigned', ...),
  (user2, 'task_assigned', ...),
  (user3, 'task_assigned', ...)
) AS t(user_id, type, title, message, data);
```

### Caching Strategy
```
User Badge Count:    Cache for 5 minutes
Recent Notifications: Cache for 1 minute
Preferences:         Cache for 1 hour
```

## Error Recovery Patterns

### Delivery Failure
```
try {
  deliver(notification)
} catch (error) {
  if (retriable(error)) {
    scheduleRetry(notification, attempt + 1)
  } else {
    markAsFailed(notification)
    notifyAdmins(error)
  }
}
```

### Cascade Failure Prevention
```
Circuit Breaker Pattern:
- Track failure rate per channel
- If > 50% failures in 5 minutes
- Disable channel for 10 minutes
- Route to alternative channel
```

## Summary

This lifecycle design ensures:

1. **Reliability**: Multiple retry attempts with exponential backoff
2. **Efficiency**: Bulk operations and smart grouping
3. **Flexibility**: Channel-specific behaviors and fallbacks
4. **Tracking**: Complete audit trail of notification states
5. **Performance**: Optimized database operations and caching

The state machine provides clear visibility into notification flow and helps identify bottlenecks or failures in the delivery pipeline.