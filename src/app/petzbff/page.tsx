import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The quiz moved to /petzbff/quiz (now a sibling of /petzbff/wheel). Keep /petzbff working for
// every link already in the wild — the Shopify handoff and confirmation emails all point here —
// by forwarding to the quiz, query string and all, so the ?email= prefill survives the hop.
export default function PetzBffIndex(
  { searchParams }: { searchParams: Record<string, string | string[] | undefined> },
) {
  const qs = new URLSearchParams(
    Object.entries(searchParams).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map(x => [k, x] as [string, string])
        : v != null ? [[k, v] as [string, string]]
        : []),
  ).toString()
  redirect(`/petzbff/quiz${qs ? `?${qs}` : ''}`)
}
