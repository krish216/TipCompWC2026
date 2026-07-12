'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

// One-tap "message my tribe on WhatsApp" — opens a wa.me share deep link with a
// prefilled, EDITABLE message so the Chief tweaks the wording, then picks their tribe
// group in WhatsApp. No WhatsApp Business API, no phone numbers, no PII on our side.
export function WhatsAppShareButton({
  message, label = 'WhatsApp', title = 'Message on WhatsApp', hint, className,
}: {
  message: string
  label?:  string
  title?:  string
  hint?:   string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(message)
  // Re-sync when the default changes (e.g. round/link updates) while the panel is closed.
  useEffect(() => { if (!open) setText(message) }, [message, open])

  const href = `https://wa.me/?text=${encodeURIComponent(text)}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#1ebe5b] transition-colors', className)}>
        <WhatsAppIcon /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><WhatsAppIcon /> {title}</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">{hint ?? 'Edit the message, then pick your tribe group in WhatsApp.'}</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none" />
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#1ebe5b] transition-colors">
              <WhatsAppIcon /> Open WhatsApp →
            </a>
          </div>
        </div>
      )}
    </>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.652a11.882 11.882 0 005.71 1.454h.005c6.585 0 11.946-5.359 11.949-11.893a11.821 11.821 0 00-3.479-8.46z"/>
    </svg>
  )
}
