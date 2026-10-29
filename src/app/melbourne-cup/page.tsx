import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { EoiForm } from './EoiForm'
import { DRAW_OPENS_LABEL } from '@/lib/sweep/field'

export const revalidate = 900

const SLUG = 'melbourne-cup-2026'

async function getCup() {
  try {
    const admin = createAdminClient()
    const cols = 'id, name, race_date:end_date, race_start_at, enrollment_open'
    let { data, error } = await (admin.from('tournaments') as any).select(`${cols}, sweep_draw_open`).eq('slug', SLUG).maybeSingle()
    // sweep_draw_open arrives with migration 201 — don't lose the whole page without it.
    if (error) ({ data } = await (admin.from('tournaments') as any).select(cols).eq('slug', SLUG).maybeSingle())
    return data as {
      id: string; name: string; race_date: string | null; race_start_at: string | null
      enrollment_open: boolean | null; sweep_draw_open: boolean | null
    } | null
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
  // Admin → Tournament → "New sweeps" / "Draw" (migrations 196, 201): sweeps can sell before
  // the field is declared; only the spin waits for it.
  const sweepsOpen = cup?.enrollment_open !== false
  const drawOpen = cup?.sweep_draw_open !== false

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

      {sweepsOpen ? (
        <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4">
          <p className="text-sm text-emerald-900">
            <span className="font-bold">Sweeps are open — start selling now.</span>{' '}
            {drawOpen
              ? 'The final field is in, so everyone can spin for their horse straight away.'
              : `Tickets sell today; the draw opens ${DRAW_OPENS_LABEL}, once the final field is declared — we'll remind everyone to spin.`}
          </p>
          <Link href="/sweep" className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
            Start your sweep →
          </Link>
        </div>
      ) : (
        // No "start a sweep" shortcut while new sweeps are paused — this page collects interest.
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-bold">Sweeps open on {DRAW_OPENS_LABEL}</span>, once the final field is declared.
            Register below and we'll let you know the moment you can start yours.
          </p>
        </div>
      )}

      <div id="register" className="mt-8 scroll-mt-20">
        <h2 className="text-lg font-black text-gray-900">{sweepsOpen ? "Don't have a sweep to join?" : 'Register your interest'}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          {sweepsOpen
            ? "Leave your details and we'll be in touch — whether you'd like help running one, or a sweep to join."
            : "Want to run a sweep, or join one? Leave your details and we'll be in touch when the field is final."}
        </p>
        {cup
          ? <EoiForm tournamentId={cup.id} source={searchParams.src ?? null} initialIntent={searchParams.intent === 'join' || sweepsOpen ? 'join' : 'organise'} sweepsOpen={sweepsOpen} />
          : <p className="text-sm text-gray-400">Registrations aren't open yet — check back soon.</p>}
      </div>

      <p className="text-[11px] text-gray-400 mt-8">
        TribePicks never holds sweep money — buyers pay the organiser directly. Your details are only used to
        contact you about Melbourne Cup sweeps. See our <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
    </main>
  )
}
