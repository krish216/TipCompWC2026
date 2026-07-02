import React from 'react'

// Render plain-text content with clickable links (http/https only). Safe: only
// well-formed http(s) URLs become <a> tags; everything else stays plain text, so
// there's no HTML injection. Shared by tribe chat + announcements.
export function linkify(text: string): React.ReactNode {
  if (!text) return text
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">{part}</a>
      : part,
  )
}
