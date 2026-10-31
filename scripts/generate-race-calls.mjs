// Voices the demo race scripts (src/lib/sweep/demo-race-scripts.ts) with ElevenLabs, into
// public/race-calls/. A local one-off: the key stays in .env.local and never goes to Vercel —
// the site only ever serves the finished mp3s.
//
//   npx tsx scripts/generate-race-calls.mjs            # only what's missing
//   npx tsx scripts/generate-race-calls.mjs race-2     # redo one race
//
// Writes src/lib/sweep/demo-race-audio.json — each clip's length in seconds — so the demo can
// time the horses to the voice.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_SCRIPTS } from '../src/lib/sweep/demo-race-scripts.ts'

const key = readFileSync('.env.local', 'utf8').match(/^ELEVENLABS_API_KEY=["']?([^"'\s]+)/m)?.[1]
if (!key) throw new Error('ELEVENLABS_API_KEY missing from .env.local')

const VOICES = { vicky: 'vcedRTI2CgypSP2qMCLB', gordon: 'ThXZu2AntqfxXDVXmhMp' }
const OUT = 'public/race-calls'
const API = 'https://api.elevenlabs.io/v1'
const redo = new Set(process.argv.slice(2))

// mp3_44100_128 is constant bitrate, so the length falls straight out of the file size.
const secs = file => Math.round((statSync(file).size * 8 / 128_000) * 100) / 100

async function post(path, body, file) {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${file}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log('  ✓', file)
}

// v3 delivery tags: the call builds, the finish is shouted, Gordo's mid-race outburst is shouted.
function tagged(line) {
  if (line.who === 'gordon') return `[shouting] ${line.text}`
  if (line.at >= 0.82) return `[shouting] ${line.text}`
  return `[excited] ${line.text}`
}
const dialogue = lines => ({ model_id: 'eleven_v3', inputs: lines.map(l => ({ voice_id: VOICES[l.who], text: l.text })) })

const manifest = {}
mkdirSync(join(OUT, 'sfx'), { recursive: true })

const sfx = [
  ['bell', 'Racecourse starting gates crashing open with a bell ringing, horses jumping', 3],
  ['crowd', 'Big racecourse crowd roaring and cheering as horses thunder down the home straight', 22],
]
for (const [name, text, duration_seconds] of sfx) {
  const file = join(OUT, 'sfx', `${name}.mp3`)
  if (!existsSync(file)) await post('/sound-generation', { text, duration_seconds, prompt_influence: 0.5 }, file)
  manifest[`sfx-${name}`] = secs(file)
}

for (const s of DEMO_SCRIPTS) {
  console.log(s.id)
  const dir = join(OUT, s.id)
  mkdirSync(dir, { recursive: true })
  const need = file => redo.has(s.id) || !existsSync(file)

  const intro = join(dir, 'intro.mp3'), outro = join(dir, 'outro.mp3')
  if (need(intro)) await post('/text-to-dialogue', dialogue(s.intro), intro)
  if (need(outro)) {
    const [first, ...rest] = s.outro
    await post('/text-to-dialogue', dialogue([{ ...first, text: `[excited] ${first.text}` }, ...rest]), outro)
  }

  const race = []
  for (const [i, line] of s.race.entries()) {
    const file = join(dir, `call-${String(i).padStart(2, '0')}.mp3`)
    if (need(file)) await post(`/text-to-speech/${VOICES[line.who]}`, { text: tagged(line), model_id: 'eleven_v3' }, file)
    race.push(secs(file))
  }
  manifest[s.id] = { intro: secs(intro), race, outro: secs(outro) }
}

writeFileSync('src/lib/sweep/demo-race-audio.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('wrote src/lib/sweep/demo-race-audio.json')

// When each word is spoken (ElevenLabs forced alignment — needs the key's forced_alignment
// permission), so the demo can show the words as they're said. Per clip, per line, the start
// of each word of line.text.split(' '). Without it the demo estimates from the clip lengths.
const WORDS_FILE = 'src/lib/sweep/demo-race-words.json'
const words = existsSync(WORDS_FILE) ? JSON.parse(readFileSync(WORDS_FILE, 'utf8')) : {}

async function align(file, lines) {
  const text = lines.map(l => l.text).join(' ')
  const form = new FormData()
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), 'clip.mp3')
  form.append('text', text)
  const res = await fetch(`${API}/forced-alignment`, { method: 'POST', headers: { 'xi-api-key': key }, body: form })
  if (!res.ok) throw new Error(`${file}: alignment ${res.status} ${(await res.text()).slice(0, 300)}`)
  const { characters } = await res.json()
  if (characters.map(c => c.text).join('') !== text) throw new Error(`${file}: alignment didn't return the text back`)
  // Each word's first character carries its start time.
  let offset = 0
  const timings = lines.map(l => {
    const starts = l.text.split(' ').map(w => { const s = characters[offset].start; offset += w.length + 1; return Math.round(s * 100) / 100 })
    return starts
  })
  console.log('  ⏱', file)
  return timings
}

for (const s of DEMO_SCRIPTS) {
  const w = (words[s.id] = redo.has(s.id) ? {} : words[s.id] ?? {})
  const dir = join(OUT, s.id)
  w.intro ??= await align(join(dir, 'intro.mp3'), s.intro)
  w.outro ??= await align(join(dir, 'outro.mp3'), s.outro)
  w.race ??= []
  for (const [i, line] of s.race.entries()) {
    w.race[i] ??= await align(join(dir, `call-${String(i).padStart(2, '0')}.mp3`), [line])
  }
  writeFileSync(WORDS_FILE, JSON.stringify(words) + '\n')   // after each race, so a failure keeps what's done
}
console.log(`wrote ${WORDS_FILE}`)
