// PetzBFF Cat Quiz — question bank.
//
// Mirrors the dog quiz (petzbff-quiz.ts): a fixed easy ladder of 5, then a random tail drawn
// from the medium and hard pools, options shuffled per run. Scoring, capture, discount codes
// and the 3-play cap are all shared — only the questions differ.
//
// Facts are grounded in well-established cat knowledge; the two softer items from the first
// draft (jump distance, purr-frequency "healing") were swapped for solid ones (nose-print
// uniqueness, ultrasonic hearing). Question 5 is a VISUAL question — its illustration (a brown
// tabby, see QuizIllustration) is the thing being identified. Still worth a human eyeball on the
// single-correct-answer per question before it goes to real players. Edit freely.

import { assembleRun, type Question } from './petzbff-quiz'

export const FIXED: Question[] = [
  {
    q: 'How do cats mainly show they are content?',
    options: ['Purring', 'Growling', 'Panting', 'Drooling'],
    a: 0,
    why: 'A relaxed cat purrs (though some also purr when stressed or healing). Growling is the opposite signal.',
  },
  {
    q: 'Which of these is toxic to cats?',
    options: ['Plain cooked chicken', 'Onion', 'Plain cooked pumpkin', 'A little plain rice'],
    a: 1,
    why: 'Onion and garlic damage a cat’s red blood cells. The other three are fine in small, plain amounts.',
  },
  {
    q: 'About how many hours a day does a typical cat sleep?',
    options: ['4 to 6', '8 to 10', '12 to 16', '20 to 22'],
    a: 2,
    why: 'Twelve to sixteen hours. As crepuscular hunters they conserve energy between dawn and dusk bursts.',
  },
  {
    q: 'What is a group of cats called?',
    options: ['A clowder', 'A pack', 'A herd', 'A pride'],
    a: 0,
    why: 'A clowder. A pride is specifically lions; packs are for dogs and wolves.',
  },
  {
    // Visual question: the illustration is a brown tabby (stripes + forehead "M").
    q: 'What is this cat’s coat pattern called?',
    image: 'tabby-cat',
    options: ['Tabby', 'Calico', 'Tuxedo', 'Solid'],
    a: 0,
    why: 'The stripes — and the classic "M" on the forehead — make this a tabby, the most common cat coat pattern.',
  },
]

export const MEDIUM: Question[] = [
  {
    q: 'What are a cat’s whiskers mainly for?',
    options: ['Sensing surroundings and gauging gaps', 'Decoration', 'Tasting food', 'Keeping warm'],
    a: 0,
    why: 'Whiskers are touch sensors that help a cat judge whether it fits through a gap. Never trim them.',
  },
  {
    q: 'A healthy adult cat’s body temperature sits at about:',
    options: ['36.0 C', '37.0 C', '38.5 C', '41.0 C'],
    a: 2,
    why: 'Normal range is roughly 38.1 to 39.2 C, so a cat runs warmer than you do.',
  },
  {
    q: 'How many toes does a typical (non-polydactyl) cat have in total?',
    options: ['16', '18', '20', '22'],
    a: 1,
    why: 'Eighteen: five on each front paw and four on each back paw. Polydactyl cats have extras.',
  },
  {
    q: 'Which taste can cats NOT detect?',
    options: ['Salty', 'Sour', 'Bitter', 'Sweet'],
    a: 3,
    why: 'Cats lack working sweet-taste receptors — as obligate carnivores, they never needed them.',
  },
  {
    q: 'A cat sweats mainly through its:',
    options: ['Tongue', 'Paw pads', 'Ears', 'Belly'],
    a: 1,
    why: 'The only real sweat glands are in the paw pads; cats mostly cool down by grooming.',
  },
  {
    q: 'The average lifespan of an indoor cat is roughly:',
    options: ['3 to 5 years', '6 to 9 years', '12 to 18 years', 'Over 25 years'],
    a: 2,
    why: 'Indoor cats commonly reach twelve to eighteen years — well beyond the typical outdoor cat.',
  },
  {
    q: 'Kittens are born:',
    options: ['Deaf and blind', 'Fully able to see', 'With all their teeth', 'Able to walk'],
    a: 0,
    why: 'Blind and deaf. Eyes open around 7 to 10 days; the ear canals open a little later.',
  },
  {
    q: 'Why do cats knead with their front paws?',
    options: ['A comfort behaviour left over from nursing', 'To sharpen their claws', 'To cool down', 'To improve balance'],
    a: 0,
    why: 'Kittens knead to stimulate their mother’s milk; contented adults keep doing it.',
  },
  {
    q: 'A cat’s collarbone is unusual because it:',
    options: ['Floats free, letting them squeeze through tight gaps', 'Is the largest bone in the body', 'Is made only of cartilage', 'Does not exist at all'],
    a: 0,
    why: 'The free-floating clavicle is why a cat can usually fit through any gap its head passes.',
  },
  {
    q: 'A cat’s nose print is:',
    options: ['Unique to each cat, like a fingerprint', 'Always solid black', 'Mainly used to keep it cool', 'Identical within a breed'],
    a: 0,
    why: 'Every cat’s nose has its own pattern of ridges and bumps — as unique as a human fingerprint.',
  },
]

export const HARD: Question[] = [
  {
    q: 'Which breed is known for being born without a tail?',
    options: ['Manx', 'Bengal', 'Ragdoll', 'Siamese'],
    a: 0,
    why: 'The Manx carries a gene that shortens or removes the tail entirely.',
  },
  {
    q: 'Which breed is famous for being (nearly) hairless?',
    options: ['Maine Coon', 'Sphynx', 'Siberian', 'Birman'],
    a: 1,
    why: 'The Sphynx. With almost no coat it needs regular bathing to manage skin oils.',
  },
  {
    q: 'What eye colour are virtually all kittens born with?',
    options: ['Green', 'Blue', 'Amber', 'Brown'],
    a: 1,
    why: 'All kittens start with blue eyes; the adult colour develops over the first few weeks.',
  },
  {
    q: 'The vast majority of calico (tortoiseshell-and-white) cats are:',
    options: ['Female', 'Male', 'Deaf', 'Blind'],
    a: 0,
    why: 'The coat-colour genes are carried on the X chromosome, so nearly all calicos are female.',
  },
  {
    q: 'Which is among the largest domestic cat breeds, often over 8 kg?',
    options: ['Singapura', 'Maine Coon', 'Devon Rex', 'Munchkin'],
    a: 1,
    why: 'The Maine Coon — a long, heavy, tufted-eared breed built for cold winters.',
  },
  {
    q: 'The “Flehmen response” — that open-mouthed grimace — lets a cat:',
    options: ['“Taste” scents using an organ in the roof of the mouth', 'See ultraviolet light', 'Hear ultrasound', 'Cool its blood'],
    a: 0,
    why: 'It draws scent onto the vomeronasal (Jacobson’s) organ on the palate for a deeper read.',
  },
  {
    q: 'Which breed tends to go completely limp when you pick it up?',
    options: ['Ragdoll', 'Abyssinian', 'Cornish Rex', 'Savannah'],
    a: 0,
    why: 'The Ragdoll relaxes and flops in your arms — which is exactly how it got its name.',
  },
  {
    q: 'A cat’s “primordial pouch” is:',
    options: ['The loose flap of skin along the belly', 'A scent gland behind the ear', 'A pouch for carrying kittens', 'Part of the inner ear'],
    a: 0,
    why: 'The saggy belly flap protects the abdomen and lets a cat stretch and twist at full stretch.',
  },
  {
    q: 'A cat’s hearing reaches far higher than ours — up to about:',
    options: ['20 kHz, the same as humans', '40 kHz', '64 kHz', '200 kHz'],
    a: 2,
    why: 'Cats hear up to around 64 kHz, well into ultrasound — tuned to the high-pitched squeaks of mice and rats.',
  },
  {
    q: 'The “righting reflex” is what lets a falling cat:',
    options: ['Twist to land on its feet', 'See in total darkness', 'Climb down trees headfirst', 'Hold its breath'],
    a: 0,
    why: 'A flexible spine and no functional collarbone let a cat rotate upright — given a little height.',
  },
]

/** One run of the Cat quiz — same assembly as the dog quiz, different bank. */
export function newRun(): Question[] {
  return assembleRun(FIXED, MEDIUM, HARD)
}
