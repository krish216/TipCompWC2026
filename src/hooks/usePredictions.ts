'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import toast from 'react-hot-toast'
import type { Prediction, RoundId } from '@/types'

type PredMap = Record<number, { home: number; away: number }>

export function usePredictions(round: RoundId) {
  const { supabase, session } = useSupabase()
  const [predictions, setPredictions] = useState<PredMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const debounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // ── Fetch predictions for this round ───────────────────────
  useEffect(() => {
    if (!session) { setLoading(false); return }
    setLoading(true)

    fetch(`/api/predictions?round=${round}`)
      .then(r => r.json())
      .then(({ data }) => {
        const map: PredMap = {}
        ;(data ?? []).forEach((p: Prediction) => {
          map[p.fixture_id] = { home: p.home, away: p.away }
        })
        setPredictions(map)
      })
      .catch(() => toast.error('Failed to load predictions'))
      .finally(() => setLoading(false))
  }, [round, session])

  // ── Optimistic update + debounced save ──────────────────────
  const setPrediction = useCallback((
    fixtureId: number,
    side: 'home' | 'away',
    value: number
  ) => {
    // Optimistic update
    setPredictions(prev => {
      const current = prev[fixtureId] ?? { home: -1, away: -1 }
      return { ...prev, [fixtureId]: { ...current, [side]: value } }
    })

    // Debounce save — wait 600ms after last keystroke
    clearTimeout(debounceRef.current[fixtureId])
    debounceRef.current[fixtureId] = setTimeout(() => {
      setPredictions(current => {
        const p = current[fixtureId]
        if (!p || p.home < 0 || p.away < 0) return current
        savePrediction(fixtureId, p.home, p.away)
        return current
      })
    }, 600)
  }, [])

  // ── Persist to API ──────────────────────────────────────────
  const savePrediction = useCallback(async (
    fixtureId: number,
    home: number,
    away: number
  ) => {
    setSaving(prev => new Set(prev).add(fixtureId))
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture_id: fixtureId, home, away }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        if (res.status === 409) {
          toast.error('Prediction locked — match has started')
        } else {
          toast.error(error ?? 'Failed to save prediction')
        }
      }
    } catch {
      toast.error('Network error — prediction not saved')
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s })
    }
  }, [])

  // ── Realtime: update points when results arrive ─────────────
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('predictions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'predictions',
          filter: `user_id=eq.${session.user.id}`,
        },
        payload => {
          const updated = payload.new as Prediction
          setPredictions(prev => ({
            ...prev,
            [updated.fixture_id]: { home: updated.home, away: updated.away },
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, session])

  const clearPrediction = useCallback(async (fixtureId: number) => {
    const res = await fetch(`/api/predictions?fixture_id=${fixtureId}`, { method: 'DELETE' })
    if (res.ok) {
      setPredictions(prev => { const n = { ...prev }; delete n[fixtureId]; return n })
    } else {
      const { error } = await res.json()
      toast.error(error ?? 'Cannot remove prediction')
    }
  }, [])

  return { predictions, loading, saving, setPrediction, clearPrediction }
}
