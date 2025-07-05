# Notification Flow Examples

## Complete Flow Examples

### Example 1: Task Assignment Notification

Let's trace a complete notification flow when a task is assigned to a user.

```
SCENARIO: Project Manager assigns "Fix electrical wiring" task to John Smith
```

#### Step-by-Step Flow:

```
1. UI Action
   └─> UPDATE tasks SET assignee_id = 'john-uuid' WHERE id = 'task-123'

2. Database Trigger Fires
   └─> notify_task_changes() trigger activates
       ├─> Detects assignee_id changed
       ├─> Fetches project name: "Building A Renovation"
       └─> Fetches assigner name: "Sarah Johnson"

3. Create Notification Record
   └─> create_notification() function called
       ├─> INSERT INTO notifications
       │   └─> Data inserted:
       │       - user_id: 'john-uuid'
       │       - type: 'task_assigned'
       │       - title: 'New Task Assignment'
       │       - message: 'Sarah Johnson assigned you to: Fix electrical wiring'
       │       - priority: 'high' (task is urgent)
       │       - entity_type: 'task'
       │       - entity_id: 'task-123'
       │
       ├─> Check user preferences
       │   └─> John has email and push enabled
       │
       ├─> queue_email_notification('notification-456')
       │   └─> INSERT INTO email_queue
       │       - scheduled_for: NOW() + 5 minutes (high priority)
       │
       └─> queue_push_notification('notification-456')
           └─> INSERT INTO push_queue (2 devices)
               - iPhone: 'fcm-token-123'
               - Web: 'web-push-subscription'

4. Supabase Realtime Broadcast
   └─> Channel: user-notifications:john-uuid
       └─> Event: INSERT on notifications table
           └─> WebSocket message sent to all John's connected clients

5. Client UI Updates (Immediate)
   └─> John's browser receives WebSocket message
       ├─> Notification badge updates: 3 → 4
       ├─> Toast notification appears
       └─> Notification added to dropdown

6. Push Notification Delivery (Immediate)
   └─> Edge Function triggered
       ├─> Fetch from push_queue
       ├─> Send via FCM to iPhone
       │   └─> John's phone shows notification
       └─> Send via Web Push to browser
           └─> Service worker shows notification

7. Email Delivery (After 5 minutes)
   └─> Batch processor runs
       ├─> Fetch from email_queue
       ├─> Render email template
       └─> Send via Resend API
           └─> John receives email
```

#### Database State After Flow:

```sql
-- notifications table
{
  id: 'notification-456',
  user_id: 'john-uuid',
  type: 'task_assigned',
  title: 'New Task Assignment',
  message: 'Sarah Johnson assigned you to: Fix electrical wiring',
  is_read: false,
  created_at: '2024-01-15 10:00:00'
}

-- notification_deliveries table
[
  {
    notification_id: 'notification-456',
    channel: 'realtime',
    status: 'delivered',
    delivered_at: '2024-01-15 10:00:01'
  },
  {
    notification_id: 'notification-456',
    channel: 'push',
    status: 'delivered',
    delivered_at: '2024-01-15 10:00:05'
  },
  {
    notification_id: 'notification-456',
    channel: 'email',
    status: 'delivered',
    delivered_at: '2024-01-15 10:05:00'
  }
]
```

### Example 2: Bulk Approval Request

```
SCENARIO: CFO requests budget approval from 3 executives for $50,000 equipment purchase
```

#### Step-by-Step Flow:

```
1. Approval Creation
   └─> INSERT INTO approvals (title: 'Equipment Purchase', amount: 50000)
       └─> INSERT INTO approval_approvers (3 approvers)

2. Database Trigger Fires
   └─> notify_approval_changes() trigger
       └─> Loop through 3 approvers

3. Bulk Notification Creation
   └─> create_notification() called 3 times
       ├─> CEO: notification-789
       ├─> COO: notification-790
       └─> CTO: notification-791
       
   Each notification:
   - type: 'approval_requested'
   - priority: 'critical' (due today)
   - title: 'Approval Required'
   - message: 'Jane CFO requested approval for: Equipment Purchase'

4. Parallel Processing
   ├─> Realtime: 3 WebSocket messages sent simultaneously
   ├─> Push: 6 devices queued (2 per executive)
   └─> Email: 3 emails queued for immediate delivery

5. Edge Functions Execute
   ├─> Push Function
   │   └─> Batch sends to all 6 devices
   │       └─> All executives' phones buzz simultaneously
   │
   └─> Email Function
       └─> 3 emails sent with "URGENT" flag
           └─> Delivered to priority inbox
```

### Example 3: System-wide Maintenance Notification

```
SCENARIO: Admin schedules system maintenance for tonight at 10 PM
```

#### Step-by-Step Flow:

```
1. Admin Creates System Notification
   └─> Call system API endpoint

2. Broadcast to All Users
   └─> Database Function: create_system_notification()
       ├─> Get all active users (1,234 users)
       └─> Bulk insert notifications

3. Optimized Bulk Insert
   └─> INSERT INTO notifications 
       SELECT generate_series, 'system', 'Scheduled Maintenance', ...
       FROM users WHERE active = true

4. Notification Aggregation
   └─> 1,234 records created in < 100ms

5. Delivery Strategy
   ├─> Realtime: Broadcast channel used
   │   └─> Single message to 'system-notifications' channel
   │       └─> All connected clients receive simultaneously
   │
   ├─> Email: Batched delivery
   │   └─> Queue groups of 100
   │       └─> Sent over 30 minutes to avoid rate limits
   │
   └─> Push: Priority queuing
       └─> Critical priority ensures immediate delivery
           └─> All devices notified within 30 seconds
```

### Example 4: Comment with @Mentions

```
SCENARIO: User comments on task mentioning 2 team members
Comment: "Hey @alice and @bob, can you review this?"
```

#### Step-by-Step Flow:

```
1. Comment Creation
   └─> INSERT INTO task_comments (content: 'Hey @alice and @bob...')

2. Comment Trigger Processing
   └─> notify_task_comment() trigger
       ├─> Extract mentioned users: ['alice-uuid', 'bob-uuid']
       ├─> Get task assignee: 'charlie-uuid'
       └─> Get commenter: 'david-uuid'

3. Multiple Notifications Created
   ├─> For Charlie (assignee):
   │   └─> type: 'task_comment'
   │       title: 'New Comment on Your Task'
   │       priority: 'medium'
   │
   ├─> For Alice (mentioned):
   │   └─> type: 'comment_mention'
   │       title: 'You were mentioned in a comment'
   │       priority: 'high'
   │
   └─> For Bob (mentioned):
       └─> type: 'comment_mention'
           title: 'You were mentioned in a comment'
           priority: 'high'

4. Smart Aggregation
   └─> If Alice was mentioned 3 times in 5 minutes:
       └─> Single notification: "You were mentioned in 3 comments"
           └─> Reduces notification fatigue
```

## Notification Delivery Timing

### Priority-based Scheduling:

```
┌─────────────┬──────────────┬───────────────┬────────────────┐
│  Priority   │   Realtime   │     Push      │     Email      │
├─────────────┼──────────────┼───────────────┼────────────────┤
│  Critical   │  Immediate   │   Immediate   │   Immediate    │
│    High     │  Immediate   │   Immediate   │  5 minutes     │
│   Medium    │  Immediate   │   Immediate   │  15 minutes    │
│    Low      │  Immediate   │   Disabled    │  30 minutes    │
└─────────────┴──────────────┴───────────────┴────────────────┘
```

## Error Handling Examples

### Failed Email Delivery:

```
1. Email Send Fails
   └─> Resend API returns 429 (Rate Limited)

2. Error Handling
   ├─> Update email_queue.status = 'failed'
   ├─> Log error_message
   └─> Schedule retry

3. Retry Logic
   └─> Exponential backoff: 1min → 2min → 4min
       └─> After 3 failures: Mark as permanently failed
           └─> Admin notification created

4. Fallback
   └─> If email critical and fails:
       └─> Ensure push notification sent
           └─> User still gets notified
```

### Invalid Push Token:

```
1. Push Send Fails
   └─> FCM returns: InvalidRegistration

2. Token Cleanup
   ├─> Update user_devices.push_enabled = false
   └─> Create notification for user:
       "Push notifications disabled - please re-enable"

3. Future Notifications
   └─> Skip push for this device
       └─> Still deliver via email and in-app
```

## Performance Optimizations in Action

### Notification Aggregation Example:

```
Without Aggregation:
- 10:00 AM: "John commented on Task A"
- 10:02 AM: "Sarah commented on Task B"  
- 10:03 AM: "Mike commented on Task C"
- 10:04 AM: "Lisa commented on Task D"
→ 4 separate notifications = noise

With Aggregation:
- 10:00 AM: "John commented on Task A"
- 10:05 AM: "3 new comments on your tasks"
→ 2 notifications = cleaner UX
```

### Batch Processing Example:

```
Email Queue Processing:
┌────────────────────────────────────────┐
│  100 emails queued at 10:00 AM         │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  Batch Processor (runs every 5 min)    │
├────────────────────────────────────────┤
│  - Groups by priority                  │
│  - Sends in parallel (10 at a time)   │
│  - Respects rate limits                │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  Results:                              │
│  - 95 delivered successfully           │
│  - 3 retried (temporary failures)     │
│  - 2 failed (invalid emails)          │
│  - Total time: 45 seconds             │
└────────────────────────────────────────┘
```

## Monitoring & Analytics

### Real-time Metrics Dashboard:

```
┌─────────────────────────────────────────────────────┐
│              Live Notification Metrics               │
├─────────────────────────────────────────────────────┤
│  Total Today: 12,456  |  Delivery Rate: 98.7%      │
│                                                     │
│  By Channel:                                        │
│  ┌─────────────────────────────────────────┐      │
│  │ ████████████████████ In-App (100%)      │      │
│  │ ███████████████████  Push (95.2%)       │      │
│  │ ████████████████     Email (89.1%)      │      │
│  └─────────────────────────────────────────┘      │
│                                                     │
│  By Type (Last Hour):                              │
│  • Task Assignments: 234                            │
│  • Comments: 567                                    │
│  • Approvals: 89                                    │
│  • System: 12                                       │
│                                                     │
│  Average Read Time: 3.2 minutes                    │
│  Peak Hour: 2:00 PM (1,234 notifications)         │
└─────────────────────────────────────────────────────┘
```

## Testing Scenarios

### Load Test Example:

```python
# Simulate 1000 concurrent task assignments
async def load_test_notifications():
    tasks = []
    for i in range(1000):
        task = assign_task(
            task_id=f'task-{i}',
            assignee_id=f'user-{i % 100}',  # 100 users
            title=f'Load Test Task {i}'
        )
        tasks.append(task)
    
    results = await asyncio.gather(*tasks)
    
    # Measure:
    # - Notification creation time: < 500ms per notification
    # - Realtime delivery: < 1 second to all clients
    # - Push delivery: < 5 seconds to all devices
    # - Email queuing: < 10 seconds for all 1000
```

## Summary

These examples demonstrate:

1. **End-to-end flows** from user action to multi-channel delivery
2. **Parallel processing** for optimal performance
3. **Smart aggregation** to reduce notification fatigue
4. **Robust error handling** with fallback mechanisms
5. **Performance optimizations** in real scenarios
6. **Monitoring capabilities** for system health

The system handles everything from simple single notifications to complex bulk operations, all while maintaining sub-second response times for critical paths.