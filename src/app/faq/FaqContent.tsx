'use client'

import { useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { FAQS } from './faqs'

function AccordionItem({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-3 py-3.5 px-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-800">{q}</span>
        <span className={clsx('text-gray-400 transition-transform flex-shrink-0 text-xs', open && 'rotate-180')}>▼</span>
      </button>
      {/* Always render the answer into the DOM (crawlable in the SSR HTML), just
          collapse it visually when closed — conditional mounting hid it from search. */}
      <div className={clsx('px-4 pb-4', !open && 'hidden')}>
        <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

export default function FaqContent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="text-sm text-gray-500 mt-1">Everything you need to know about TribePicks and WC 2026.</p>
      </div>

      <div className="space-y-4">
        {FAQS.map(section => (
          <div key={section.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-base leading-none">{section.emoji}</span>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{section.category}</h2>
            </div>
            {section.items.map(item => (
              <AccordionItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-8">
        Still have questions?{' '}
        <a href="mailto:tribepicks@gmail.com" className="underline hover:text-gray-600 transition-colors">
          Get in touch
        </a>
      </p>
    </div>
  )
}
