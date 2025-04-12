import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types.generated'
import { useState } from 'react'
import { useEffect } from 'react'

let supabase: ReturnType<typeof createBrowserClient<Database>> | null = null

const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export const getSupabaseClient = () => {
  if (!supabase) {
    supabase = createClient();
  }

  return supabase;
}
