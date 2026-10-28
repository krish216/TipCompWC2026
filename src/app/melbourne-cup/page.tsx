import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { EoiForm } from './EoiForm'

export const revalidate = 900

const SLUG = 'melbourne-cup-2026'

async function getCup() {
  try {
    const admin = createAdminClient()
    const { data } = await (admin.from('tournaments') as any)
      .select('id, name, race_date:end_date, race_start_at').eq('slug', SLUG).maybeSingle()
    return data as { id: string; name: string; race_date: string | null; race_start_at: string | null } | null
  } catch { return null }
}

export const metadata: Metadata = {
  title: 'Melbourne Cup 2026 sweep — run or join one online | TribePicks',
  description: 'Run your office or group Melbourne Cup sweep online: share a link, buyers pay you directly, everyone spins the wheel for their horse. Or register to join a sweep if you don\'t have one.',
  alternates: { canonical: 'https://tribepicks.com/melbourne-cup' },
  openGraph: {
    title: 'Melbourne Cup 2026 sweep on TribePicks',
    description: 'Run your group\'s sweep online, or register to join one.',
    url: 'https://tribepicks.com/melbourne-cup',
    type: 'website',
  },
}

function raceDayLabel(cup: { race_date: string | null; race_start_at: string | null } | null): string {
  if (cup?.race_start_at) {
    return new Date(cup.race_start_at).toLocaleString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne',
    }) + ' (Melbourne time)'
  }
  if (cup?.race_date) {
    return new Date(`${cup.race_date}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  }
  return 'Tuesday 3 November'
}

const STEPS = [
  { icon: '🔗', title: 'Share one link', body: 'Create your sweep and send the link to your office, club or group chat.' },
  { icon: '💸', title: 'They pay you', body: 'Cash, bank transfer or PayID — straight to you. You approve each ticket.' },
  { icon: '🎡', title: 'Spin for a horse', body: 'Each ticket spins the wheel for a random horse. The full draw shows once the pool fills.' },
]

export default async function MelbourneCupPage({ searchParams }: { searchParams: { src?: string; intent?: string } }) {
  const cup = await getCup()

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">🐎 {raceDayLabel(cup)}</p>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Melbourne Cup 2026 sweeps</h1>
      <p className="text-sm text-gray-500 mt-2">
        The race that stops a nation — without the spreadsheet, the hat and the chasing. Run your group's
        sweep on TribePicks, or tell us you'd like one to join.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        {STEPS.map(s => (
          <div key={s.title} className="border border-gray-200 rounded-2xl p-4">
            <div className="text-2xl">{s.icon}</div>
            <p className="text-sm font-bold text-gray-900 mt-1">{s.title}</p>
            <p className="text-xs text-gray-500 mt-1">{s.body}</p>
          </div>
        ))}
      </div>

      {/* No "start a sweep" shortcut: the field isn't final until 30 Oct, so sweeps can't
          sell properly before then — this page collects interest until it is. */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
        <p className="text-sm text-amber-900">
          <span className="font-bold">Sweeps open once the field is announced</span> on Friday 30 October.
          Register below and we'll let you know the moment you can start yours.
        </p>
      </div>

      <div id="register" className="mt-8 scroll-mt-20">
        <h2 className="text-lg font-black text-gray-900">Register your interest</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">Want to run a sweep, or join one? Leave your details and we'll be in touch when the field is final.</p>
        {cup
          ? <EoiForm tournamentId={cup.id} source={searchParams.src ?? null} initialIntent={searchParams.intent === 'join' ? 'join' : 'organise'} />
          : <p className="text-sm text-gray-400">Registrations aren't open yet — check back soon.</p>}
      </div>

      <p className="text-[11px] text-gray-400 mt-8">
        TribePicks never holds sweep money — buyers pay the organiser directly. Your details are only used to
        contact you about Melbourne Cup sweeps. See our <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
    </main>
  )
}
