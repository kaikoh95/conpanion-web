export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("Supabase URL not configured");
}

export const API_ENDPOINTS = {
  createApproval: `${SUPABASE_URL}/functions/v1/create-approval`,
} as const; 