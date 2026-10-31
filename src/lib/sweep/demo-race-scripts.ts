// Scripted races for the public demo (/melbourne-cup/race) — a double act: Vicky calls the
// race, Gordo backs a loser every time. Original characters and lines, not an impression
// of any real caller or commentary team.
//
// One source for two jobs: scripts/generate-race-calls.mjs voices every line (ElevenLabs →
// public/race-calls/), and the demo plays them while the horses follow each call's `front`,
// so whoever Vicky names really is in front at that moment. Horses are called by name only:
// your horse is random from the wheel, so the voice never says whose horse is whose.
//
// Practice field (migration 200): 1 Phar Lap · 2 Makybe Diva · 3 Think Big · 4 Rain Lover ·
// 5 Might And Power · 6 Vintage Crop · 7 Saintly · 8 Efficient · 9 Gold And Black ·
// 10 Archer · 11 Light Fingers · 12 Van Der Hum

export type Speaker = 'vicky' | 'gordon'
export type Line = { who: Speaker; text: string }
// `at` — roughly how far through the race the call comes (the clips play back to back, so the
// real timing comes from their lengths in demo-race-audio.json).
// `front` — the leaders at that moment, in order (horse numbers).
// `back` — the back marker, kept last until a later call names it in `front`.
export type RaceLine = Line & { at: number; front: number[]; back?: number }

export type DemoScript = {
  id: string
  finish: number[]     // the full finishing order, horse numbers
  intro: Line[]        // before the jump, horses in the gates
  race: RaceLine[]
  outro: Line[]        // after the line
}

const GATES: Line = { who: 'vicky', text: "They're in the gates… and they're set…" }
const JUMP = (text = "They're off in the Practice Cup!"): RaceLine => ({ who: 'vicky', at: 0, front: [], text })

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: 'race-1',   // Gordon: Saintly
    finish: [3, 2, 9, 4, 11, 1, 10, 6, 8, 12, 5, 7],
    intro: [
      { who: 'vicky', text: 'Welcome to the Practice Cup — twelve runners, sixty dollars in the office pot.' },
      { who: 'gordon', text: 'Sixty dollars, Vicky. People have changed jobs for less.' },
      { who: 'vicky', text: 'Any tips, Gordo?' },
      { who: 'gordon', text: "Saintly. I looked into its eyes in the mounting yard. It looked back. That's a connection." },
      { who: 'vicky', text: 'Yeah, right! It was looking at your sandwich.' },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [7, 1, 10], text: 'Saintly goes forward, Phar Lap handy on the rails, Archer just behind.' },
      { who: 'vicky', at: 0.18, front: [7, 1, 10], back: 3, text: 'Back marker is Think Big, giving them a big start.' },
      { who: 'vicky', at: 0.30, front: [7, 1, 10, 4], text: 'Down the back, Saintly leads from Phar Lap, then Archer and Rain Lover.' },
      { who: 'vicky', at: 0.42, front: [7, 1, 4, 3], text: 'Passing the eight hundred, Think Big starting to improve out wide!' },
      { who: 'vicky', at: 0.52, front: [7, 1, 3], text: "Six hundred to go — Saintly, Phar Lap, Think Big, they're all bunched!" },
      { who: 'gordon', at: 0.58, front: [7, 1, 3], text: "THAT'S MY BOY!" },
      { who: 'vicky', at: 0.62, front: [3, 1, 2], text: "And Saintly's gone straight back through the field! Think Big looming!" },
      { who: 'vicky', at: 0.72, front: [3, 2, 1], text: 'Into the straight — Think Big kicks for home! Makybe Diva goes with it!' },
      { who: 'vicky', at: 0.82, front: [3, 2, 9], text: 'Two hundred to go — Gold And Black flying late down the outside!' },
      { who: 'vicky', at: 0.92, front: [3, 2, 9], text: 'Think Big… Makybe Diva… Think Big by a whisker!' },
    ],
    outro: [
      { who: 'vicky', text: 'Think Big wins the Practice Cup! Makybe Diva second, Gold And Black third. Saintly… finished.' },
      { who: 'gordon', text: 'I want it on the record that I said "Think Big" in my head.' },
      { who: 'vicky', text: 'Mate… you said Saintly. We could hear you from across the street.' },
      { who: 'gordon', text: 'Tactical misdirection, Vicky. Never show your hand.' },
    ],
  },
  {
    id: 'race-2',   // Gordon: Phar Lap
    finish: [4, 10, 6, 2, 3, 12, 5, 8, 1, 7, 9, 11],
    intro: [
      { who: 'vicky', text: 'Welcome back to the Practice Cup — twelve runners, sixty dollars on the line.' },
      { who: 'gordon', text: "Phar Lap, Vicky. You don't bet against history." },
      { who: 'vicky', text: "History's been retired for ninety years, Gordo." },
      { who: 'gordon', text: "Then he's well rested." },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [1, 8, 11], text: 'Phar Lap pings the gates and goes forward! Efficient handy, Light Fingers on the rails.' },
      { who: 'vicky', at: 0.18, front: [1, 8, 11], back: 4, text: 'Back marker is Rain Lover, sniffing at the bum in front.' },
      { who: 'vicky', at: 0.30, front: [1, 8, 11, 10], text: "Down the back it's Phar Lap from Efficient, Light Fingers and Archer." },
      { who: 'vicky', at: 0.42, front: [1, 10, 8, 4], text: 'Passing the eight hundred, Rain Lover starting to wind up out wide!' },
      { who: 'vicky', at: 0.52, front: [10, 1, 4], text: "Six hundred to go — Phar Lap's under pressure, Archer right there!" },
      { who: 'gordon', at: 0.58, front: [10, 1, 4], text: 'COME ON, HISTORY!' },
      { who: 'vicky', at: 0.62, front: [10, 4, 6], text: "History's three wide and going backwards! Archer and Rain Lover take over!" },
      { who: 'vicky', at: 0.72, front: [4, 10, 6], text: 'Into the straight — Rain Lover hits the front! Archer fighting back!' },
      { who: 'vicky', at: 0.82, front: [4, 10, 6], text: 'Two hundred to go — Vintage Crop charging late on the inside!' },
      { who: 'vicky', at: 0.92, front: [4, 10, 6], text: 'Rain Lover… Archer… Archer pipped at the post by Rain Lover!' },
    ],
    outro: [
      { who: 'vicky', text: 'Rain Lover wins it! Archer second, Vintage Crop third. Phar Lap… a respectable ninth.' },
      { who: 'gordon', text: "Ninth out of twelve. That's top ten, Vicky. That's a podium in some sports." },
      { who: 'vicky', text: 'Name one.' },
      { who: 'gordon', text: 'Rugby. You can fit twenty players on the podium.' },
    ],
  },
  {
    id: 'race-3',   // Gordon: Van Der Hum
    finish: [11, 8, 5, 3, 1, 4, 7, 2, 10, 6, 9, 12],
    intro: [
      { who: 'vicky', text: 'Twelve go round in the Practice Cup, sixty dollars in the pot. Gordo, your pick?' },
      { who: 'gordon', text: "Van Der Hum. Say it out loud, Vicky. Van Der Hum. That's a horse that hums." },
      { who: 'vicky', text: 'Hums what?' },
      { who: 'gordon', text: 'Victory, Vicky. Victory.' },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [12, 11, 8], text: 'Van Der Hum flies out and leads! Light Fingers sits second, Efficient handy.' },
      { who: 'vicky', at: 0.18, front: [12, 11, 8], back: 5, text: 'Back marker is Might And Power, settled at the tail.' },
      { who: 'vicky', at: 0.30, front: [12, 11, 8, 3], text: 'Down the back, Van Der Hum leads from Light Fingers, Efficient and Think Big.' },
      { who: 'vicky', at: 0.42, front: [12, 11, 8, 3], text: "Passing the eight hundred, Van Der Hum's still in charge, but they're closing!" },
      { who: 'vicky', at: 0.52, front: [11, 12, 8], text: "Six hundred to go — Light Fingers moving up to Van Der Hum's girth!" },
      { who: 'gordon', at: 0.58, front: [11, 12, 8], text: 'HUM, BOY, HUM! YOU BEAUTY!' },
      { who: 'vicky', at: 0.62, front: [11, 8, 3], text: "He's humming at the back, Gordo! Light Fingers takes over at the turn!" },
      { who: 'vicky', at: 0.72, front: [11, 8, 5], text: 'Into the straight — Light Fingers kicks clear! Efficient chasing hard!' },
      { who: 'vicky', at: 0.82, front: [11, 8, 5], text: 'Two hundred to go — Might And Power flashing home from the back!' },
      { who: 'vicky', at: 0.92, front: [11, 8, 5], text: 'Light Fingers… Efficient… Light Fingers has pinched it!' },
    ],
    outro: [
      { who: 'vicky', text: 'Light Fingers steals it! Efficient second, Might And Power third. Van Der Hum… stopped humming.' },
      { who: 'gordon', text: 'The name says it all. Light Fingers. Stole it from under our noses.' },
      { who: 'vicky', text: "That's not how it works." },
      { who: 'gordon', text: 'I want the stewards to check its pockets.' },
    ],
  },
  {
    id: 'race-4',   // Gordon: Gold And Black
    finish: [12, 7, 3, 1, 6, 10, 2, 4, 11, 8, 5, 9],
    intro: [
      { who: 'vicky', text: 'The Practice Cup — twelve runners, sixty dollars in the office pot.' },
      { who: 'gordon', text: 'Gold And Black, Vicky. Look at those silks. You dress for the job you want.' },
      { who: 'vicky', text: 'You picked a horse on its outfit.' },
      { who: 'gordon', text: "Every other method's let me down." },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [9, 7, 12], text: 'Gold And Black jumps best and leads! Saintly second, Van Der Hum on the rails.' },
      { who: 'vicky', at: 0.18, front: [9, 7, 12], back: 3, text: 'Back marker is Think Big, a long way to make up.' },
      { who: 'vicky', at: 0.30, front: [9, 7, 12, 1], text: 'Down the back, Gold And Black from Saintly, Van Der Hum and Phar Lap.' },
      { who: 'vicky', at: 0.42, front: [7, 9, 12, 1], text: "Passing the eight hundred — Gold And Black's starting to feel the pinch!" },
      { who: 'vicky', at: 0.52, front: [7, 12, 9], text: 'Six hundred to go — Saintly takes it up, Van Der Hum poised behind!' },
      { who: 'gordon', at: 0.58, front: [7, 12, 9], text: 'LOOKING SHARP, GOLDIE!' },
      { who: 'vicky', at: 0.62, front: [12, 7, 3], text: 'Looking sharp, running blunt! Van Der Hum and Saintly come to the turn together!' },
      { who: 'vicky', at: 0.72, front: [12, 7, 3], text: "Into the straight — Van Der Hum hits the lead! Saintly won't give in!" },
      { who: 'vicky', at: 0.82, front: [12, 7, 3], text: 'Two hundred to go — Think Big storming home out wide!' },
      { who: 'vicky', at: 0.92, front: [12, 7, 3], text: 'Van Der Hum… Saintly… Van Der Hum by a neck!' },
    ],
    outro: [
      { who: 'vicky', text: 'Van Der Hum wins the Practice Cup! Saintly second, Think Big third. Gold And Black… best dressed.' },
      { who: 'gordon', text: "Best dressed. I'll take that. There's no prize money for it—" },
      { who: 'vicky', text: "There isn't." },
      { who: 'gordon', text: '—but there should be.' },
    ],
  },
  {
    id: 'race-5',   // Gordon: Efficient
    finish: [2, 1, 11, 10, 4, 7, 3, 9, 12, 6, 5, 8],
    intro: [
      { who: 'vicky', text: 'Welcome to the Practice Cup — twelve runners, sixty dollars up for grabs.' },
      { who: 'gordon', text: "I've done the numbers this time, Vicky. Spreadsheet. Colour-coded. Efficient." },
      { who: 'vicky', text: "You've picked Efficient because you made a spreadsheet." },
      { who: 'gordon', text: "It's called synergy." },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [8, 1, 2], text: 'Efficient rolls forward to lead! Phar Lap handy, Makybe Diva in a lovely spot.' },
      { who: 'vicky', at: 0.18, front: [8, 1, 2], back: 11, text: 'Back marker is Light Fingers, travelling sweetly at the tail.' },
      { who: 'vicky', at: 0.30, front: [8, 1, 2, 10], text: 'Down the back, Efficient leads from Phar Lap, Makybe Diva and Archer.' },
      { who: 'vicky', at: 0.42, front: [8, 2, 1, 10], text: "Passing the eight hundred, Makybe Diva's moving up without being asked!" },
      { who: 'vicky', at: 0.52, front: [1, 2, 8], text: "Six hundred to go — Efficient's working hard, Phar Lap and Makybe Diva closing!" },
      { who: 'gordon', at: 0.58, front: [1, 2, 8], text: 'PIVOT, EFFICIENT, PIVOT!' },
      { who: 'vicky', at: 0.62, front: [1, 2, 10], text: "It's pivoted the wrong way, Gordo! Phar Lap and Makybe Diva clear at the turn!" },
      { who: 'vicky', at: 0.72, front: [2, 1, 10], text: 'Into the straight — Makybe Diva and Phar Lap, locked together!' },
      { who: 'vicky', at: 0.82, front: [2, 1, 11], text: 'Two hundred to go — Light Fingers sprinting home from last!' },
      { who: 'vicky', at: 0.92, front: [2, 1, 11], text: 'Makybe Diva… Phar Lap… Makybe Diva just holding him!' },
    ],
    outro: [
      { who: 'vicky', text: 'Makybe Diva wins it! Phar Lap second, Light Fingers third. Efficient… was not.' },
      { who: 'gordon', text: "Right. I'm putting Efficient on a performance improvement plan." },
      { who: 'vicky', text: "It's a horse." },
      { who: 'gordon', text: "Then it'll be a short meeting." },
    ],
  },
  {
    id: 'race-6',   // Gordon: Might And Power — and it runs second
    finish: [10, 5, 4, 6, 2, 9, 12, 1, 8, 3, 11, 7],
    intro: [
      { who: 'vicky', text: 'The Practice Cup — twelve runners, sixty dollars in the pot. Gordo, your selection?' },
      { who: 'gordon', text: 'Might And Power. Two of my favourite things, Vicky.' },
      { who: 'vicky', text: "And you've got neither." },
      { who: 'gordon', text: "That's why I need the sixty dollars." },
      GATES,
    ],
    race: [
      JUMP(),
      { who: 'vicky', at: 0.08, front: [10, 5, 4], text: 'Archer goes forward and leads! Might And Power second, Rain Lover handy.' },
      { who: 'vicky', at: 0.18, front: [10, 5, 4], back: 7, text: 'Back marker is Saintly, struggling to go the pace.' },
      { who: 'vicky', at: 0.30, front: [10, 5, 4, 6], text: 'Down the back, Archer leads from Might And Power, Rain Lover and Vintage Crop.' },
      { who: 'vicky', at: 0.42, front: [10, 5, 4, 6], text: "Passing the eight hundred, Archer's travelling well, Might And Power right on his hip!" },
      { who: 'vicky', at: 0.52, front: [5, 10, 4], text: 'Six hundred to go — Might And Power ranges up alongside!' },
      { who: 'gordon', at: 0.58, front: [5, 10, 4], text: 'MIGHT! POWER! BOTH!' },
      { who: 'vicky', at: 0.62, front: [5, 10, 4], text: "He's actually in this, Gordo! Archer and Might And Power, side by side at the turn!" },
      { who: 'vicky', at: 0.72, front: [10, 5, 4], text: 'Into the straight — Archer kicks again! Might And Power fighting back!' },
      { who: 'vicky', at: 0.82, front: [10, 5, 4], text: "Two hundred to go — Rain Lover making ground, but they're well clear!" },
      { who: 'vicky', at: 0.92, front: [10, 5, 4], text: 'Archer… Might And Power… Archer by a long head!' },
    ],
    outro: [
      { who: 'vicky', text: 'Archer wins the Practice Cup! Might And Power second, Rain Lover third.' },
      { who: 'gordon', text: "SECOND! Vicky, I've finished on the podium!" },
      { who: 'vicky', text: 'Your horse did.' },
      { who: 'gordon', text: "We're a team. I'm taking the twelve dollars and I'm framing it." },
    ],
  },
]
