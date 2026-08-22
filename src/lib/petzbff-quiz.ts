// PetzBFF Dog Lovers Show Quiz — question bank and run assembly.
//
// GENERATED from Projects/PetBff/Dog IQ Quiz/questions.json. Edit there and regenerate
// rather than hand-editing, so the Shopify copy and this one cannot drift apart.
//
// Questions 1-5 are a fixed easy ladder. 6-7 are drawn from the medium pool, 8-10 from
// hard, and every question's options are shuffled — so replaying to farm a 30% means
// learning the whole bank, not one path.
//
// Known trap when editing: Archie and Ange are both apricot doodles and Rosie is golden,
// so never write a question that separates them by coat colour. It would have more than
// one right answer.

export interface Question {
  q: string
  options: string[]
  a: number      // index of the correct option
  why: string    // one-line explainer shown after answering
}

export const STEP = 3                    // % added per correct answer
export const DRAW = { medium: 2, hard: 3 } as const

// The Shopify discount codes. Must match src/app/api/petzbff-promo/route.ts and Shopify.
export const CODES: Record<number, string> = {
  3: 'PETZBFF3', 6: 'PETZBFF6', 9: 'PETZBFF9', 12: 'PETZBFF12', 15: 'PETZBFF15',
  18: 'Maisey18', 21: 'Bear21', 24: 'Waffles24', 27: 'Murph27', 30: 'QNeve30',
}

export const FIXED: Question[] = [
    {
      "q": "How do dogs mainly cool themselves down?",
      "options": [
        "Panting",
        "Sweating through their skin",
        "Shivering",
        "Wagging their tail"
      ],
      "a": 0,
      "why": "Dogs only sweat a little through their paw pads. Panting is the real air conditioning."
    },
    {
      "q": "Which of these snacks is toxic to dogs?",
      "options": [
        "Carrot sticks",
        "Grapes",
        "Plain cooked pumpkin",
        "Green beans"
      ],
      "a": 1,
      "why": "Grapes and sultanas can cause kidney failure in dogs, even in small amounts. The other three are fine in moderation."
    },
    {
      "q": "Roughly how long is a dog pregnancy?",
      "options": [
        "About 3 weeks",
        "About 9 weeks",
        "About 6 months",
        "About 11 months"
      ],
      "a": 1,
      "why": "Around 63 days, give or take a few. Puppies arrive fast."
    },
    {
      "q": "Which breed is the fastest over a short sprint?",
      "options": [
        "Border Collie",
        "Dalmatian",
        "Greyhound",
        "Boxer"
      ],
      "a": 2,
      "why": "Greyhounds hit around 70 km/h. Whippets are quick too, but the Greyhound takes it."
    },
    {
      "q": "The Newfoundland is a champion swimmer thanks to which feature?",
      "options": [
        "Webbed feet",
        "Hollow bones",
        "Waterproof eyelids",
        "A rudder-shaped spine"
      ],
      "a": 0,
      "why": "Webbed feet plus a thick water-resistant double coat. They have been used as water rescue dogs for centuries."
    }
  ]

export const MEDIUM: Question[] = [
    {
      "q": "A healthy adult dog's body temperature sits at about:",
      "options": [
        "36.5 C",
        "37.0 C",
        "38.5 C",
        "40.5 C"
      ],
      "a": 2,
      "why": "Normal range is roughly 38.0 to 39.2 C, so a dog runs warmer than you do. Over 39.5 C is worth a vet call."
    },
    {
      "q": "How many teeth does an adult dog have?",
      "options": [
        "28",
        "32",
        "42",
        "54"
      ],
      "a": 2,
      "why": "42 as an adult, up from 28 milk teeth as a puppy. Humans only manage 32."
    },
    {
      "q": "The Dachshund was originally bred to hunt which animal?",
      "options": [
        "Badger",
        "Fox",
        "Rabbit",
        "Otter"
      ],
      "a": 0,
      "why": "Dachs is German for badger. The long low body was built for going down the tunnel after one."
    },
    {
      "q": "Which is the smallest recognised dog breed?",
      "options": [
        "Yorkshire Terrier",
        "Chihuahua",
        "Papillon",
        "Pomeranian"
      ],
      "a": 1,
      "why": "The Chihuahua takes it, often under 2 kg fully grown, and entirely unaware of the fact."
    },
    {
      "q": "Newborn puppies cannot yet do which of these?",
      "options": [
        "Smell",
        "Hear",
        "Suckle",
        "Feel warmth"
      ],
      "a": 1,
      "why": "Puppies are born deaf and blind. The ear canals open at around two weeks."
    },
    {
      "q": "Which pair of colours do dogs struggle to tell apart?",
      "options": [
        "Blue and yellow",
        "Red and green",
        "Black and white",
        "Light and dark"
      ],
      "a": 1,
      "why": "Dogs see the world in blues and yellows. Red and green both read as murky yellow-grey, which is why that red ball vanishes on the lawn."
    },
    {
      "q": "What is the average lifespan of a Great Dane?",
      "options": [
        "About 7 to 10 years",
        "About 12 to 14 years",
        "About 15 to 18 years",
        "Over 20 years"
      ],
      "a": 0,
      "why": "Giant breeds age fast. Seven to ten years is typical, which is the cruel trade for all that dog."
    },
    {
      "q": "Which of these is genuinely dangerous to give a dog?",
      "options": [
        "Plain peanut butter",
        "Peanut butter sweetened with xylitol",
        "A raw carrot",
        "Plain natural yoghurt"
      ],
      "a": 1,
      "why": "Xylitol is the problem, not the peanut butter. It can cause a dangerous drop in blood sugar. Always check the label."
    },
    {
      "q": "Which breed is famous for herding using 'the eye', a crouching stare?",
      "options": [
        "Border Collie",
        "German Shepherd",
        "Corgi",
        "Rottweiler"
      ],
      "a": 0,
      "why": "The Border Collie crouches and stares stock into moving. Corgis take the other approach and nip at heels."
    }
  ]

export const HARD: Question[] = [
    {
      "q": "Which breed famously cannot bark, and yodels instead?",
      "options": [
        "Shiba Inu",
        "Basenji",
        "Papillon",
        "Whippet"
      ],
      "a": 1,
      "why": "The Basenji's oddly shaped larynx produces a yodel, nicknamed the baroo."
    },
    {
      "q": "Which breed is known for a blue-black tongue?",
      "options": [
        "Akita",
        "Samoyed",
        "Keeshond",
        "Chow Chow"
      ],
      "a": 3,
      "why": "Chow Chows are born with pink tongues that darken to blue-black within a few months."
    },
    {
      "q": "What do Dalmatian puppies look like when they are born?",
      "options": [
        "Fully spotted",
        "Completely white",
        "Solid grey",
        "Brown with white paws"
      ],
      "a": 1,
      "why": "Dalmatians arrive pure white. The spots start showing at around two to three weeks."
    },
    {
      "q": "The Norwegian Lundehund is unique for having how many toes on each foot?",
      "options": [
        "Four",
        "Five",
        "Six",
        "Seven"
      ],
      "a": 2,
      "why": "Six fully formed toes, bred for scaling cliffs after puffins. Nobody gets this one by accident."
    },
    {
      "q": "The Rhodesian Ridgeback was originally bred to track which animal?",
      "options": [
        "Lion",
        "Wild boar",
        "Elephant",
        "Baboon"
      ],
      "a": 0,
      "why": "Bred in southern Africa to find and hold lions at bay until the hunter arrived. Hence the old name, African Lion Hound."
    },
    {
      "q": "A human nose has about 6 million scent receptors. A dog's has roughly:",
      "options": [
        "20 million",
        "60 million",
        "300 million",
        "3 billion"
      ],
      "a": 2,
      "why": "Around 300 million in the best-nosed breeds, which is why a Bloodhound can follow a trail days old."
    },
    {
      "q": "Where on a dog is the carpal pad?",
      "options": [
        "Between the ears",
        "On the back of the front leg, above the paw",
        "Under the base of the tail",
        "On the tip of the nose"
      ],
      "a": 1,
      "why": "That lonely little pad higher up the front leg. It works as a brake on steep ground."
    },
    {
      "q": "The 'zoomies' have a proper scientific name. What is it?",
      "options": [
        "FRAPs",
        "SPRINTs",
        "ZAPs",
        "RAMPs"
      ],
      "a": 0,
      "why": "Frenetic Random Activity Periods. Every bit as dignified as it looks at 10pm on the rug."
    },
    {
      "q": "The Xoloitzcuintli is best known for what?",
      "options": [
        "Being hairless",
        "Having blue eyes",
        "Being unable to swim",
        "Having no tail"
      ],
      "a": 0,
      "why": "An ancient Mexican breed, usually hairless, and pronounced roughly show-low-eets-QUEENT-lee. Good luck."
    },
    {
      "q": "What is the correct term for a dog's whiskers?",
      "options": [
        "Cilia",
        "Setae",
        "Vibrissae",
        "Barbels"
      ],
      "a": 2,
      "why": "Vibrissae. They are touch sensors wired straight to the nervous system, not decoration, which is why you never trim them."
    }
  ]

function shuffle<T>(list: T[]): T[] {
  const c = list.slice()
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[c[i], c[j]] = [c[j], c[i]]
  }
  return c
}

/** Reorder a question's options, keeping `a` pointing at the same answer text. */
export function scramble(question: Question): Question {
  const pairs = shuffle(question.options.map((o, i) => ({ o, right: i === question.a })))
  let a = 0
  const options = pairs.map((p, i) => { if (p.right) a = i; return p.o })
  return { q: question.q, options, a, why: question.why }
}

/** One run: the fixed ladder, then a fresh random tail, all with shuffled options. */
export function newRun(): Question[] {
  return [
    ...FIXED,
    ...shuffle(MEDIUM).slice(0, DRAW.medium),
    ...shuffle(HARD).slice(0, DRAW.hard),
  ].map(scramble)
}

export const codeFor = (pct: number): string | undefined => CODES[pct]
