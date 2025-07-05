import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { PushSubscriptionData } from '@/lib/types/push-notifications';

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
    const { subscription, userAgent } = body;

    // Validate subscription data
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { success: false, error: 'Invalid subscription data' },
        { status: 400 }
      );
    }

    const { endpoint, keys } = subscription as PushSubscriptionData;
    
    if (!keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { success: false, error: 'Missing subscription keys' },
        { status: 400 }
      );
    }

    // Store subscription in database
    const { data: subscriptionId, error: dbError } = await supabase.rpc('upsert_push_subscription', {
      user_id_param: user.id,
      endpoint_param: endpoint,
      p256dh_param: keys.p256dh,
      auth_param: keys.auth,
      user_agent_param: userAgent || null,
    });

    if (dbError) {
      console.error('Database error storing push subscription:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to store subscription' },
        { status: 500 }
      );
    }

    console.log(`Push subscription stored for user ${user.id}, subscription ID: ${subscriptionId}`);

    return NextResponse.json({
      success: true,
      id: subscriptionId,
      message: 'Push subscription stored successfully',
    });

  } catch (error) {
    console.error('Error in push subscribe endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    // Get user's push subscriptions
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

    return NextResponse.json({
      success: true,
      subscriptions: subscriptions || [],
    });

  } catch (error) {
    console.error('Error in get push subscriptions endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}