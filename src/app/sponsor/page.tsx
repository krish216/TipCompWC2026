'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// Public "Sponsor the Bracket Challenge" pitch + enquiry form.
// The form posts to /api/sponsors/enquiry, which creates a status='lead' sponsor
// and notifies admins in-app. No auth required.

const WHAT_YOU_GET = [
  { icon: '🏆', title: 'Co-branded challenge header', body: 'Your logo sits beside “Bracket Challenge” on the leaderboard everyone watches — front and centre as entrants build and check their brackets.' },
  { icon: '🎁', title: 'Your prize, your name', body: 'The headline prize is named as yours (“Win a $500 voucher from …”), turning every bracket entry into brand exposure.' },
  { icon: '📣', title: 'In-feed sponsor insert', body: 'A tasteful sponsor card below the bracket links straight to your site — clicks, not just impressions.' },
  { icon: '🤝', title: 'Category-exclusive', body: 'One sponsor owns the Bracket Challenge for the window. No competing brand alongside yours.' },
]

export default function SponsorPage() {
  const [form, setForm] = useState({ company: '', contact_name: '', contact_email: '', phone: '', website_url: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.company.trim())       { toast.error('Please add your company name'); return }
    if (!form.contact_email.trim()) { toast.error('Please add a contact email'); return }
    setBusy(true)
    const res = await fetch('/api/sponsors/enquiry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error ?? 'Something went wrong — please try again'); return }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-b from-green-900 to-green-800 text-white">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300 mb-3">Sponsorship · World Cup 2026</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Sponsor the Bracket Challenge</h1>
          <p className="mt-4 text-green-100 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Put your brand at the centre of the most-watched moment of the tournament — when players across the platform
            lock in their knockout brackets. A short, high-impact campaign over the final days of the group stage.
          </p>
          <a href="#enquire" className="inline-block mt-7 px-6 py-3 rounded-xl bg-amber-400 text-green-900 font-bold hover:bg-amber-300 transition-colors">
            Become a sponsor →
          </a>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-5 py-12 space-y-12">
        {/* Co-branded header preview */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 text-center">How it looks</p>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-md mx-auto">
            <div className="bg-green-900 px-4 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <span className="text-white font-extrabold text-sm">Bracket<br/>Challenge</span>
              <div className="text-center">
                <span className="block text-[8px] uppercase tracking-widest text-amber-300 mb-1">Sponsored by</span>
                <span className="inline-block bg-white/95 rounded px-3 py-1.5 text-green-900 font-extrabold text-xs">YOUR LOGO</span>
              </div>
              <span className="text-white font-bold text-xs text-right">🏆 Win<br/>your prize</span>
            </div>
            <div className="p-4 space-y-2">
              {[['1', 'Sam', '24'], ['2', 'Priya', '22'], ['3', 'Jo', '21']].map(([r, n, p]) => (
                <div key={r} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-bold text-gray-400">{r}</span>
                  <span className="flex-1 font-medium text-gray-700">{n}</span>
                  <span className="font-extrabold text-gray-900">{p}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-[9px] uppercase tracking-widest text-gray-400 pb-2">Representative — uses your real logo & prize</p>
          </div>
        </section>

        {/* What you get */}
        <section>
          <h2 className="text-xl font-extrabold text-gray-900 mb-4 text-center">What you get</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {WHAT_YOU_GET.map(c => (
              <div key={c.title} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-2xl mb-1.5">{c.icon}</div>
                <h3 className="font-bold text-gray-900 text-sm">{c.title}</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The window */}
        <section className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
          <h2 className="text-base font-extrabold text-amber-900 mb-1">⏱️ A short, high-intensity window</h2>
          <p className="text-sm text-amber-900/90 leading-relaxed">
            The campaign runs over the <b>final 4–5 days of the group stage</b>, as players complete their knockout brackets —
            and ends the moment the <b>Round of 32 kicks off (28 June)</b> and brackets lock. That concentration is the point:
            maximum attention on your brand exactly when engagement peaks.
          </p>
        </section>

        {/* Enquiry form */}
        <section id="enquire" className="scroll-mt-20">
          <h2 className="text-xl font-extrabold text-gray-900 mb-1 text-center">Become a sponsor</h2>
          <p className="text-sm text-gray-500 text-center mb-5">Tell us about your brand — we’ll be in touch with the details.</p>

          {done ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="font-extrabold text-emerald-800 text-lg">Thanks — we’ve got it.</h3>
              <p className="text-sm text-emerald-700 mt-1">We’ll reach out shortly to walk you through the campaign and pricing.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <SponsorField label="Company / brand *" value={form.company} onChange={set('company')} placeholder="Your business name" />
                <SponsorField label="Website" value={form.website_url} onChange={set('website_url')} placeholder="https://…" />
                <SponsorField label="Contact name" value={form.contact_name} onChange={set('contact_name')} />
                <SponsorField label="Contact email *" value={form.contact_email} onChange={set('contact_email')} type="email" />
                <SponsorField label="Phone" value={form.phone} onChange={set('phone')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Anything you’d like us to know?</label>
                <textarea value={form.message} onChange={set('message')} rows={3}
                  placeholder="Budget, prize you’d offer, questions…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              </div>
              <button type="submit" disabled={busy}
                className={clsx('w-full py-3 rounded-xl font-bold text-white transition-colors',
                  busy ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700')}>
                {busy ? 'Sending…' : 'Send enquiry'}
              </button>
              <p className="text-[11px] text-gray-400 text-center">We’ll only use your details to discuss sponsorship.</p>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

function SponsorField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
    </div>
  )
}
