import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Uses service role key — bypasses RLS. Only call from server-side API routes.
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}
