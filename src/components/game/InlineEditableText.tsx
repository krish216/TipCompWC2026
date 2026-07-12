'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useOwnerView } from '@/components/game/OwnerViewContext'
import { Spinner } from '@/components/ui'
import toast from 'react-hot-toast'

// Inline-editable identity text (headline / bio) on the Chief profile. Read-only for
// everyone; the owner gets an inline pencil to edit in place and save straight to their
// users row — no trip to Settings. Hidden entirely in "Preview as Tipster" mode.
export function InlineEditableText({
  field, value: initial, className, placeholder, addLabel, maxLength = 280, multiline = false,
}: {
  field: 'tagline' | 'bio'
  value: string | null
  className?: string
  placeholder?: string
  addLabel: string
  maxLength?: number
  multiline?: boolean
}) {
  const { session, supabase } = useSupabase()
  const { isOwner, preview } = useOwnerView()
  const canEdit = isOwner && !preview

  const [value, setValue]     = useState(initial ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const [saving, setSaving]   = useState(false)

  const save = async () => {
    if (!session) return
    setSaving(true)
    const { error } = await (supabase.from('users') as any)
      .update({ [field]: draft.trim() || null }).eq('id', session.user.id)
    setSaving(false)
    if (error) { toast.error('Couldn’t save — try again'); return }
    setValue(draft.trim()); setEditing(false); toast.success('Saved')
  }

  if (editing) {
    return (
      <div className="w-full">
        {multiline
          ? <textarea autoFocus value={draft} rows={3} onChange={e => setDraft(e.target.value.slice(0, maxLength))} placeholder={placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white resize-none" />
          : <input autoFocus value={draft} onChange={e => setDraft(e.target.value.slice(0, maxLength))} placeholder={placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />}
        <div className="flex items-center gap-2 mt-1.5">
          <button onClick={save} disabled={saving}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5">
            {saving && <Spinner className="w-3 h-3 text-white" />}Save
          </button>
          <button onClick={() => { setDraft(value); setEditing(false) }} className="px-3 py-1 text-xs font-semibold text-gray-500 hover:text-gray-700">Cancel</button>
          <span className="ml-auto text-[10px] text-gray-400 tabular-nums">{draft.length}/{maxLength}</span>
        </div>
      </div>
    )
  }

  if (!value) {
    if (!canEdit) return null
    return (
      <button onClick={() => { setDraft(''); setEditing(true) }}
        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">+ {addLabel}</button>
    )
  }

  return (
    <span className={clsx('group inline-flex items-start gap-1.5', className)}>
      <span className={multiline ? 'whitespace-pre-line' : ''}>{value}</span>
      {canEdit && (
        <button onClick={() => { setDraft(value); setEditing(true) }} aria-label="Edit"
          className="flex-shrink-0 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-xs mt-0.5">✏️</button>
      )}
    </span>
  )
}
