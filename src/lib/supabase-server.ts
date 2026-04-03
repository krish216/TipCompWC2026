import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// ─── Server client (for server components & API routes only) ─────────────────
// This file uses next/headers — only import it in server components or API routes,
// never in client components or files marked 'use client'
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
