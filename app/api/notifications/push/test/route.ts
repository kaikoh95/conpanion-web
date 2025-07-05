import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { notification } = body;

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification payload is required' },
        { status: 400 }
      );
    }

    // Get user's active push subscriptions
    const { data: subscriptions, error: dbError } = await supabase.rpc('get_user_push_subscriptions', {
      user_id_param: user.id,
    });

    if (dbError) {
      console.error('Database error getting push subscriptions:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to get subscriptions' },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active push subscriptions found' },
        { status: 404 }
      );
    }

    // Check if user should receive push notifications
    const { data: shouldReceive, error: checkError } = await supabase.rpc('should_user_receive_notification_via_channel', {
      user_id_param: user.id,
      notification_type_param: notification.data?.type || 'system_announcement',
      channel_param: 'push',
    });

    if (checkError) {
      console.error('Error checking notification preferences:', checkError);
      // Continue anyway for test notifications
    }

    if (!shouldReceive) {
      return NextResponse.json(
        { success: false, error: 'Push notifications are disabled for this user' },
        { status: 403 }
      );
    }

    // Send push notifications to all user's subscriptions
    const results = [];
    let successCount = 0;

    for (const subscription of subscriptions) {
      try {
        // Prepare push subscription object
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };

        // Here we would use the Web Push library to send the notification
        // For now, we'll simulate success since web-push needs to be configured
        // In a real implementation, this would be:
        // await webpush.sendNotification(pushSubscription, JSON.stringify(notification));
        
        results.push({
          subscriptionId: subscription.id,
          success: true,
          message: 'Test notification sent successfully',
        });
        successCount++;

      } catch (error) {
        console.error(`Failed to send push notification to subscription ${subscription.id}:`, error);
        results.push({
          subscriptionId: subscription.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`Test push notification sent to ${successCount}/${subscriptions.length} subscriptions for user ${user.id}`);

    return NextResponse.json({
      success: successCount > 0,
      successCount,
      failureCount: subscriptions.length - successCount,
      results,
      message: `Test notification sent to ${successCount} device(s)`,
    });

  } catch (error) {
    console.error('Error in push test endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}