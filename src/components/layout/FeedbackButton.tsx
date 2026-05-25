'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'

type Category = 'bug' | 'suggestion' | 'other'
type PublicResponse = { id: string; category: string; message: string; admin_response: string; response_at: string }

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug',        label: '🐛 Bug' },
  { value: 'suggestion', label: '💡 Suggestion' },
  { value: 'other',      label: '💬 Other' },
]

function timeAgo(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor(diff / 60000)
  return days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : mins > 0 ? `${mins}m ago` : 'just now'
}

export function FeedbackButton() {
  const { session } = useSupabase()
  const isGuest = !session

  const [open,           setOpen]           = useState(false)
  const [activeView,     setActiveView]     = useState<'submit' | 'updates'>('submit')
  const [category,       setCategory]       = useState<Category>('suggestion')
  const [message,        setMessage]        = useState('')
  const [contactEmail,   setContactEmail]   = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [done,           setDone]           = useState(false)
  const [publicResponses, setPublicResponses] = useState<PublicResponse[]>([])

  useEffect(() => {
    fetch('/api/feedback/responses')
      .then(r => r.json())
      .then(d => setPublicResponses(d.responses ?? []))
      .catch(() => {})
  }, [])

  const hasUpdates = publicResponses.length > 0

  const reset = () => { setCategory('suggestion'); setMessage(''); setContactEmail(''); setDone(false) }
  const close = () => { setOpen(false); reset() }

  const submit = async () => {
    if (!message.trim()) return
    setSubmitting(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          message:       message.trim(),
          page_url:      window.location.href,
          contact_email: isGuest && contactEmail.trim() ? contactEmail.trim() : undefined,
        }),
      })
      setDone(true)
      setTimeout(close, 2000)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Share feedback"
        className="fixed bottom-24 sm:bottom-6 right-4 z-40 w-11 h-11 rounded-full
                   bg-green-700 text-white shadow-lg flex items-center justify-center
                   hover:bg-green-800 active:scale-95 transition-all print:hidden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223Z" clipRule="evenodd" />
        </svg>
        {hasUpdates && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm z-10 overflow-hidden">

            {/* Tab bar — only shown when there are published responses */}
            {hasUpdates && (
              <div className="flex border-b border-gray-100">
                <button
                  onClick={() => setActiveView('submit')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    activeView === 'submit' ? 'text-gray-900 border-b-2 border-green-700' : 'text-gray-400 hover:text-gray-600'
                  }`}>
                  Share feedback
                </button>
                <button
                  onClick={() => setActiveView('updates')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${
                    activeView === 'updates' ? 'text-gray-900 border-b-2 border-green-700' : 'text-gray-400 hover:text-gray-600'
                  }`}>
                  Updates from us
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
                    {publicResponses.length}
                  </span>
                </button>
              </div>
            )}

            {/* Submit view */}
            {activeView === 'submit' && (
              <div className="p-5">
                {done ? (
                  <div className="text-center py-4">
                    <div className="text-4xl mb-2">🙏</div>
                    <p className="font-semibold text-gray-800">Thanks for your feedback!</p>
                    <p className="text-sm text-gray-500 mt-1">We read every submission.</p>
                  </div>
                ) : (
                  <>
                    {!hasUpdates && (
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-900">Share feedback</h2>
                        <button onClick={close} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                      </div>
                    )}
                    {hasUpdates && (
                      <div className="flex justify-end mb-3">
                        <button onClick={close} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                      </div>
                    )}

                    <div className="flex gap-2 mb-4">
                      {CATEGORIES.map(c => (
                        <button key={c.value} onClick={() => setCategory(c.value)}
                          className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all
                            ${category === c.value
                              ? 'bg-green-700 text-white border-green-700'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Tell us what's on your mind…"
                      rows={4}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none
                                 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                                 placeholder:text-gray-400"
                    />

                    {isGuest && (
                      <div className="mt-3">
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={e => setContactEmail(e.target.value)}
                          placeholder="Your email (optional — if you'd like a reply)"
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2
                                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                                     placeholder:text-gray-400"
                        />
                      </div>
                    )}

                    <button onClick={submit} disabled={!message.trim() || submitting}
                      className="mt-3 w-full bg-green-700 text-white font-semibold text-sm
                                 rounded-xl py-2.5 disabled:opacity-50 hover:bg-green-800
                                 active:scale-95 transition-all">
                      {submitting ? 'Sending…' : 'Send feedback'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Updates view */}
            {activeView === 'updates' && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-900">Updates from us</h2>
                  <button onClick={close} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {publicResponses.map(r => {
                    const catLabel = r.category === 'bug' ? '🐛' : r.category === 'suggestion' ? '💡' : '💬'
                    return (
                      <div key={r.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{catLabel}</span>
                          <p className="text-xs text-gray-500 italic flex-1 line-clamp-2">&ldquo;{r.message}&rdquo;</p>
                        </div>
                        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                          <p className="text-[11px] font-semibold text-green-700 mb-0.5">From the team</p>
                          <p className="text-xs text-green-900">{r.admin_response}</p>
                        </div>
                        <p className="text-[10px] text-gray-400 text-right">{timeAgo(r.response_at)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
