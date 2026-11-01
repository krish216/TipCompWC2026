import { ALL_VOICES_ON, ORGANISER_PARTS, VOICE_PARTS, voicesFor } from '@/lib/sweep/voices'

describe('Vicky & Gordo switches', () => {
  it('is all on with nothing set — before migrations 210–212 too', () => {
    expect(voicesFor(null)).toEqual(ALL_VOICES_ON)
    expect(voicesFor({})).toEqual(ALL_VOICES_ON)
  })

  it('turns every part off when the tournament master is off, whatever the sweep says', () => {
    const v = voicesFor({ sweep_voices: false }, true)
    expect(VOICE_PARTS.every(p => !v[p.key])).toBe(true)
  })

  it('turns off only the parts the sweep’s people hear when the organiser switches off', () => {
    const v = voicesFor({}, false)
    for (const p of ORGANISER_PARTS) expect(v[p]).toBe(false)
    expect(v.request_call).toBe(true)   // the organiser's own per-device call, not covered
  })

  it('never turns a part back on that the tournament has off', () => {
    const v = voicesFor({ sweep_voice_parts: { outro: false } }, true)
    expect(v.outro).toBe(false)
    expect(v.draw_calls).toBe(true)
  })
})
