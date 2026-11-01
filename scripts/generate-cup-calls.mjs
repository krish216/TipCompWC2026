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
import { CUP_INTRO, GORDO_LUCK, REQUEST_CALL, drawCallText, drawClipName, luckClipName } from '../src/lib/sweep/cup-calls.ts'

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

// eleven_v3 clips the last word of a clip mid-syllable. So every clip ends with a throwaway
// word after a long pause — that's what gets clipped — and we cut the mp3 in the silence
// before it, halfway between where the timestamps put the end of the speech and the start of
// the throwaway (the timestamps run up to a second late, so the halfway point stays in the gap).
const FILLER = ' [long pause] Righto.'

// Drop whole mp3 frames from `seconds` on. Skips the ID3 tag and the Xing/Info frame (its
// frame count would be wrong after the cut, so players work the length out from the bytes).
function trimMp3(buf, seconds) {
  let i = buf.slice(0, 3).toString() === 'ID3' ? 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]) : 0
  const head = buf.subarray(0, i), frames = []
  let t = 0
  while (i + 4 <= buf.length && t < seconds) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) throw new Error('not an mp3 frame')
    const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][buf[i + 2] >> 4]
    const rate = [44100, 48000, 32000][(buf[i + 2] >> 2) & 3]
    const len = Math.floor(144 * kbps * 1000 / rate) + ((buf[i + 2] >> 1) & 1)
    const frame = buf.subarray(i, i + len)
    if (!/Xing|Info/.test(frame.subarray(0, 64).toString('latin1'))) { frames.push(frame); t += 1152 / rate }
    i += len
  }
  return Buffer.concat([head, ...frames])
}

// `path` is /text-to-speech/{voice} or /text-to-dialogue; the filler goes on the last line.
async function post(path, body, file) {
  const withFiller = body.inputs
    ? { ...body, inputs: body.inputs.map((l, i, a) => (i === a.length - 1 ? { ...l, text: l.text + FILLER } : l)) }
    : { ...body, text: body.text + FILLER }
  const res = await fetch(`${API}${path}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(withFiller),
  })
  if (!res.ok) throw new Error(`${file}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const { audio_base64, alignment: a } = await res.json()
  const chars = a.characters.join(''), at = chars.lastIndexOf('[long pause]')
  const spoken = chars.slice(0, at).trimEnd().length - 1, filler = chars.lastIndexOf('Righto')
  if (at < 0 || filler < 0) throw new Error(`${file}: filler not found in the timestamps`)
  const cut = (a.character_end_times_seconds[spoken] + a.character_start_times_seconds[filler]) / 2
  writeFileSync(file, trimMp3(Buffer.from(audio_base64, 'base64'), cut))
  voiced.push(file)
  console.log('  ✓', file, `(cut at ${cut.toFixed(2)}s)`)
}
const voiced = []

// That cut leaves up to two seconds of silence — a long wait before Gordo's sign-off. Decode
// each new clip in local Chrome (Node has no mp3 decoder) and end it 0.3s after the voice stops.
async function tighten(files) {
  if (!files.length) return
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  for (const file of files) {
    const buf = readFileSync(file)
    const lastVoice = await page.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer)
      const d = audio.getChannelData(0)
      let last = 0
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.02) last = i
      return last / audio.sampleRate
    }, buf.toString('base64'))
    writeFileSync(file, trimMp3(buf, lastVoice + 0.3))
  }
  await browser.close()
  console.log(`  tightened ${files.length} clips`)
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
// Vicky's "new ticket request" heads-up on sweep-admin.
const ORGANISER_OUT = 'public/race-calls/organiser'
mkdirSync(ORGANISER_OUT, { recursive: true })
const requestCall = join(ORGANISER_OUT, 'new-request.mp3')
if (redo || !existsSync(requestCall) || old.requestText !== REQUEST_CALL) {
  await post(`/text-to-speech/${VOICES.vicky}`, { text: `[cheerful] ${REQUEST_CALL}`, model_id: 'eleven_v3' }, requestCall)
}
manifest.requestText = REQUEST_CALL

manifest.luck = GORDO_LUCK.length
manifest.luckText = GORDO_LUCK

await tighten(voiced)
if (voiced.includes(intro)) manifest.intro = secs(intro)
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${MANIFEST} (${Object.keys(manifest.horses).length} Cup horses, ${Object.keys(manifest.practice).length} practice)`)
