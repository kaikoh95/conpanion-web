export async function GET() {
  // In production, this would come from environment variables
  // For now, return a placeholder that indicates the key needs to be configured
  const vapidPublicKey = 'VAPID_KEY_NOT_CONFIGURED';

  return new Response(
    JSON.stringify({
      publicKey: vapidPublicKey,
      configured: vapidPublicKey !== 'VAPID_KEY_NOT_CONFIGURED',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}
