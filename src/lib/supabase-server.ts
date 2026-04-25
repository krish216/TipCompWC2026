import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// ─── Server client (for server components & API routes only) ─────────────────
// This file uses next/headers — only import it in server components or API routes,
// never in client components or files marked 'use client'

/**
 * Resolves the current user from the session cookie WITHOUT a network round-trip.
 * Use this in API route handlers instead of `supabase.auth.getUser()`.
 *
 * `getUser()` verifies the JWT against Supabase's auth server (network call) which
 * can return null when the access token is mid-refresh, causing spurious 401s.
 * `getSession()` verifies the JWT signature locally — sufficient for identifying
 * the user when the admin client is used for DB queries.
 */
export async function getSessionUser() {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: object) {
          cookieStore.set({ name, value, ...options } as any)
        },
        remove(name: string, options: object) {
          cookieStore.set({ name, value: '', ...options } as any)
        },
      },
    }
  )
}
