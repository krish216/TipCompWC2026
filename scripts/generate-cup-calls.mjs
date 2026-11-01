// Voices Vicky and Gordo for the REAL Melbourne Cup sweep (src/lib/sweep/cup-calls.ts) with
// ElevenLabs, into public/race-calls/cup-2026/: the intro, and a "you drew" call per horse
// read from the live field — plus the practice field's calls, into public/race-calls/practice/. A local one-off, like generate-race-calls.mjs — the ElevenLabs key
// stays in .env.local and never goes to Vercel.
//
//   npx tsx scripts/generate-cup-calls.mjs          # only what's missing (or whose horse changed)
//   npx tsx scripts/generate-cup-calls.mjs --redo   # everything again
//   … --no-intro                                    # just the per-horse calls
//
// Writes src/lib/sweep/cup-calls.json — the intro's length and each clip's horse name, so the
// app only plays a call for the horse it names. Re-run after a field change.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { CUP_INTRO, GORDO_LUCK, drawCallText, drawClipName, luckClipName } from '../src/lib/sweep/cup-calls.ts'

const env = readFileSync('.env.local', 'utf8')
const val = k => env.match(new RegExp(`^${k}=["']?([^"'\\s]+)`, 'm'))?.[1]
const key = val('ELEVENLABS_API_KEY')
if (!key) throw new Error('ELEVENLABS_API_KEY missing from .env.local')

const VOICES = { vicky: 'vcedRTI2CgypSP2qMCLB', gordon: 'ThXZu2AntqfxXDVXmhMp' }
const OUT = 'public/race-calls/cup-2026'
const MANIFEST = 'src/lib/sweep/cup-calls.json'
const API = 'https://api.elevenlabs.io/v1'
const redo = process.argv.includes('--redo')
const secs = file => Math.round((statSync(file).size * 8 / 128_000) * 100) / 100

async function post(path, body, file) {
  const res = await fetch(`${API}${path}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${file}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log('  ✓', file)
}

const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_ROLE_KEY'))
const { data: tourn } = await db.from('tournaments').select('id').eq('slug', 'melbourne-cup-2026').single()
const { data: horses } = await db.from('sweep_horses').select('number, name, barrier').eq('tournament_id', tourn.id).order('number')

mkdirSync(OUT, { recursive: true })
const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
const manifest = { horses: {} }

const intro = join(OUT, 'intro.mp3')
if (process.argv.includes('--no-intro')) { if (old.intro && existsSync(intro)) manifest.intro = old.intro }
else if (redo || !existsSync(intro)) {
  await post('/text-to-dialogue', { model_id: 'eleven_v3', inputs: CUP_INTRO.map(l => ({ voice_id: VOICES[l.who], text: l.text })) }, intro)
}
if (!process.argv.includes('--no-intro')) manifest.intro = secs(intro)

for (const h of horses) {
  if (!h.barrier) { console.log(`  – #${h.number} ${h.name}: no barrier yet, skipped`); continue }
  const file = join(OUT, `${drawClipName(h.number)}.mp3`)
  // Re-voice when the horse under this number has changed since the last run.
  if (redo || !existsSync(file) || old.horses?.[h.number] !== h.name) {
    await post(`/text-to-speech/${VOICES.vicky}`, { text: `[excited] ${drawCallText(h)}`, model_id: 'eleven_v3' }, file)
  }
  manifest.horses[h.number] = h.name
}

// The practice field (past winners): number and name only — it has no barriers.
const PRACTICE_OUT = 'public/race-calls/practice'
mkdirSync(PRACTICE_OUT, { recursive: true })
const { data: pt } = await db.from('tournaments').select('id').eq('slug', 'practice-sweep').single()
const { data: practice } = await db.from('sweep_horses').select('number, name').eq('tournament_id', pt.id).order('number')
manifest.practice = {}
for (const h of practice) {
  const file = join(PRACTICE_OUT, `${drawClipName(h.number)}.mp3`)
  if (redo || !existsSync(file) || old.practice?.[h.number] !== h.name) {
    await post(`/text-to-speech/${VOICES.vicky}`, { text: `[excited] ${drawCallText({ ...h, barrier: null })}`, model_id: 'eleven_v3' }, file)
  }
  manifest.practice[h.number] = h.name
}

// Gordo's good-luck sign-offs, played after Vicky's call on about half the spins.
const GORDO_OUT = 'public/race-calls/gordo'
mkdirSync(GORDO_OUT, { recursive: true })
for (const [i, text] of GORDO_LUCK.entries()) {
  const file = join(GORDO_OUT, `${luckClipName(i)}.mp3`)
  if (redo || !existsSync(file) || old.luckText?.[i] !== text) {
    await post(`/text-to-speech/${VOICES.gordon}`, { text: `[cheerful] ${text}`, model_id: 'eleven_v3' }, file)
  }
}
manifest.luck = GORDO_LUCK.length
manifest.luckText = GORDO_LUCK

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${MANIFEST} (${Object.keys(manifest.horses).length} Cup horses, ${Object.keys(manifest.practice).length} practice)`)
