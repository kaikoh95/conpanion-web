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
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    // Deactivate subscription in database
    const { data: success, error: dbError } = await supabase.rpc('deactivate_push_subscription', {
      user_id_param: user.id,
      endpoint_param: endpoint,
    });

    if (dbError) {
      console.error('Database error deactivating push subscription:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to unsubscribe' },
        { status: 500 }
      );
    }

    console.log(`Push subscription deactivated for user ${user.id}, endpoint: ${endpoint}`);

    return NextResponse.json({
      success: true,
      message: 'Push subscription deactivated successfully',
    });

  } catch (error) {
    console.error('Error in push unsubscribe endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    // Deactivate all push subscriptions for user
    const { data: affectedCount, error: dbError } = await supabase.rpc('deactivate_all_push_subscriptions', {
      user_id_param: user.id,
    });

    if (dbError) {
      console.error('Database error deactivating all push subscriptions:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to unsubscribe from all devices' },
        { status: 500 }
      );
    }

    console.log(`All push subscriptions deactivated for user ${user.id}, count: ${affectedCount}`);

    return NextResponse.json({
      success: true,
      affectedCount,
      message: 'All push subscriptions deactivated successfully',
    });

  } catch (error) {
    console.error('Error in push unsubscribe all endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}