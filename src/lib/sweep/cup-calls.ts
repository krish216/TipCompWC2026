// Vicky and Gordo on the REAL Melbourne Cup sweep — never a called or animated race (the real
// Cup's result only ever comes from the official finishing order). Two things, both facts
// only: no odds, no "one to beat", no opinions on real horses, nothing about real jockeys or
// trainers (riders change on race morning, so they're not named at all).
//   - an intro about the sweep itself, played from a button by My Pool's race countdown;
//   - a "you drew" call per horse — number, name, barrier — as the real wheel lands.
// Voiced by scripts/generate-cup-calls.mjs from the live field into public/race-calls/cup-2026/,
// which also writes cup-calls.json: each clip's horse name, so a call only ever plays for the
// horse it names (a re-numbered field just stays silent).
// The practice field (past winners — practice sweeps and the public demo) gets "you drew" calls
// too, in public/race-calls/practice/, so organisers rehearse what race day sounds like.
import type { Line } from './demo-race-scripts'
import CALLS from './cup-calls.json'

export const CUP_DIR = '/race-calls/cup-2026'
export const PRACTICE_DIR = '/race-calls/practice'

export const CUP_INTRO: Line[] = [
  { who: 'vicky', text: "The Cup's nearly here! I'm Vicky, and welcome to your office sweep." },
  { who: 'gordon', text: "And I'm Gordo. I haven't drawn my horse yet, Vicky, but I've already spent the winnings." },
  { who: 'vicky', text: "If you've got a ticket, spin for your horse at least half an hour before the jump. Anything left after that, we draw for you." },
  { who: 'gordon', text: 'Like a lucky dip. With feelings.' },
  { who: 'vicky', text: 'Every dollar in the pot goes back as prizes, and you pay your organiser direct.' },
  { who: 'gordon', text: "So if I win, I'm shouting the whole office… a compliment." },
  { who: 'vicky', text: "They jump at three o'clock Melbourne time on Tuesday. Good luck, everyone!" },
  { who: 'gordon', text: 'And may your horse not stop for a sandwich.' },   // a callback to practice race 1
]

// How a name is said, where the written form trips the voice up.
const SPOKEN: Record<string, string> = {
  Trustyourinstinct: 'Trust Your Instinct',
  Onesmoothoperator: 'One Smooth Operator',
  'James J Braddock': 'James J. Braddock',
}

// A few ways of saying it, so a run of spins doesn't sound like a recording. The practice
// field has no barriers, so those calls are number and name only.
export function drawCallText(h: { number: number; name: string; barrier: number | null }): string {
  const name = SPOKEN[h.name] ?? h.name.replace(/’/g, "'")
  if (!h.barrier) return [
    `Number ${h.number}, ${name}!`,
    `You've drawn number ${h.number}, ${name}!`,
    `It's number ${h.number}, ${name}!`,
  ][h.number % 3]
  return [
    `Number ${h.number}, ${name}, jumping from barrier ${h.barrier}!`,
    `You've drawn number ${h.number}, ${name}! Barrier ${h.barrier}.`,
    `It's number ${h.number}, ${name}, out of barrier ${h.barrier}!`,
  ][h.number % 3]
}

export const drawClipName = (n: number) => `draw-${String(n).padStart(2, '0')}`

type Calls = { intro?: number; horses?: Record<string, string>; practice?: Record<string, string>; luck?: number }

// The "you drew" clip for this horse — real Cup field or practice field — or null when there
// isn't one recorded for it.
export function drawCallClip(h: { number: number; name: string }): string | null {
  const c = CALLS as Calls, n = String(h.number)
  if (c.horses?.[n] === h.name) return `${CUP_DIR}/${drawClipName(h.number)}.mp3`
  if (c.practice?.[n] === h.name) return `${PRACTICE_DIR}/${drawClipName(h.number)}.mp3`
  return null
}

// Gordo's sign-off after every Vicky call — about your luck, never the
// horse's chances, so the same lines suit the real Cup, practice sweeps and the demo.
export const GORDO_LUCK: string[] = [
  'Best of luck, mate!',
  "Good luck! Don't spend it all at once.",
  'Lovely. Now we wait.',
  "Good luck! I'd shake its hoof if I could.",
  "Best of luck. Mine's still in the float.",
  'You lucky bugger!',
  'Make mum proud, champion!',
  'May Zeus be with you.',
]
export const GORDO_DIR = '/race-calls/gordo'
export const luckClipName = (i: number) => `luck-${i + 1}`

// What plays as the wheel lands: Vicky's call, then a random one of Gordo's.
export function drawCallClips(h: { number: number; name: string }): string[] | null {
  const vicky = drawCallClip(h)
  if (!vicky) return null
  const n = (CALLS as Calls).luck ?? 0
  return n ? [vicky, `${GORDO_DIR}/${luckClipName(Math.floor(Math.random() * n))}.mp3`] : [vicky]
}

// Vicky's heads-up to an organiser on sweep-admin when a ticket request comes in
// (components/game/SweepApprovalModal.tsx), into public/race-calls/organiser/.
export const REQUEST_CALL = "Ka-ching! You've got a new ticket request."

export const cupIntroClip =(): string | null => ((CALLS as Calls).intro ? `${CUP_DIR}/intro.mp3` : null)
