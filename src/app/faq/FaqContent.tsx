'use client'

import { useState, type ReactNode } from 'react'
import { clsx } from 'clsx'

const FAQS: { category: string; emoji: string; items: { q: string; a: ReactNode }[] }[] = [
  {
    category: 'Bracket & Getting Started',
    emoji: '🏆',
    items: [
      {
        q: 'Do I need an account to fill in the bracket?',
        a: 'No — you can fill in the full WC 2026 bracket as a guest, no sign-in needed. Your picks are saved in your browser while you\'re on the page.',
      },
      {
        q: 'Where is my bracket saved?',
        a: (
          <>
            When you create a free account, your bracket is automatically linked to your profile and saved permanently. Head to the{' '}
            <a href="/bracket" className="text-emerald-600 underline hover:text-emerald-700">Bracket tab</a> any time to view or update it, and if you’ve entered it into a challenge, you’ll find that under{' '}
            <a href="/tribe?tab=challenges" className="text-emerald-600 underline hover:text-emerald-700">My Tribe → Challenges</a>.
          </>
        ),
      },
      {
        q: 'Can I change my bracket picks?',
        a: 'Yes, until the tournament starts you can update any pick. Once a match has a result, picks for that match are locked.',
      },
      {
        q: 'What is the bracket challenge?',
        a: 'Before the tournament starts, you predict the winner of every knockout match all the way to the final. You earn points for each correct pick, with later-round picks worth more.',
      },
      {
        q: 'What kinds of challenges are there?',
        a: 'Two: the season-long bracket challenge (predict every knockout match to the final), and single-match challenges (predict one specific game\'s score). Many are sponsored, with real prizes — and both are free to enter.',
      },
      {
        q: 'Where do I see the challenges I\'ve entered?',
        a: (
          <>
            Go to{' '}
            <a href="/tribe?tab=challenges" className="text-emerald-600 underline hover:text-emerald-700">My Tribe → Challenges</a>. You’ll find every challenge you’ve entered — bracket and single-match — with your picks, the sponsor and prize, and once results are in, how you ranked. You also get a confirmation email each time you enter, with a link straight there.
          </>
        ),
      },
    ],
  },
  {
    category: 'Joining a Comp',
    emoji: '🔑',
    items: [
      {
        q: 'How do I join a comp?',
        a: 'You can join a public comp from the Explore page, or join a private comp using an invite link shared by the organiser. You need a free account to join.',
      },
      {
        q: 'Can I be in more than one comp?',
        a: 'Yes — you can join as many comps as you like. Your tips apply to all comps at once, so there\'s no extra effort.',
      },
      {
        q: 'What\'s a tribe?',
        a: 'A tribe is a sub-group within a comp. Organisers can split members into tribes (e.g. by office, city, or group of friends) so you can also see a tribe leaderboard alongside the overall comp standings.',
      },
      {
        q: 'I have an invite link but it says the comp is full. What do I do?',
        a: 'The organiser may have set a member cap. Reach out to them directly to ask for a spot or to raise the cap.',
      },
    ],
  },
  {
    category: 'Tipping',
    emoji: '⚽',
    items: [
      {
        q: 'When can I submit my tips?',
        a: 'You can tip a match up until kick-off. After kick-off, that match is locked and tips cannot be changed.',
      },
      {
        q: 'How are points calculated?',
        a: 'You earn points for predicting the correct result (win/draw/loss) and bonus points for getting the exact score right. The exact points breakdown is shown in the Rules page for your comp.',
      },
      {
        q: 'What happens if I miss a match?',
        a: 'Unplayed tips score zero. We send reminder emails before rounds close — make sure notifications are enabled so you don\'t miss out.',
      },
      {
        q: 'Can I change a tip after submitting?',
        a: 'Yes, you can update your tip as many times as you like before kick-off.',
      },
    ],
  },
  {
    category: 'Running a Comp',
    emoji: '📋',
    items: [
      {
        q: 'How do I create a comp?',
        a: 'Sign in, then tap "Join or create a comp" on the home screen and choose "Create". Give your comp a name, set it to public or private, and share the invite link with your group.',
      },
      {
        q: 'How do I invite people?',
        a: 'From the comp admin panel, go to the Tipsters tab and copy your invite link. Share it via WhatsApp, email, or wherever your group chats.',
      },
      {
        q: 'Can I customise points or rules?',
        a: 'Custom points are on the roadmap. For now all comps use the standard TribePicks scoring. Check the Rules page for the full breakdown.',
      },
      {
        q: 'Can I remove a member from my comp?',
        a: 'Yes — in the comp admin panel under the Tipsters tab you can block any member, which removes them from the standings.',
      },
      {
        q: 'How do I split my comp into tribes — and why would I?',
        a: 'Go to Manage → Tribes, tap "Create new tribe" and make at least two (e.g. by office, city, or group of friends), then use the "Not in a tribe" list to assign members — tick people, pick a tribe, and tap Add. You can also set a default tribe so new joiners are placed automatically, or share a tribe\'s invite code so members add themselves. Why bother? Tribes turn one big comp into team-vs-team rivalry, give everyone a smaller, more winnable "My tribe" leaderboard, and unlock a private tribe chat — which keeps casual players engaged even when the overall title is out of reach. Note: tribe features only appear once a comp has 2 or more tribes, each member is in one tribe per comp, and tribes hold up to 15 members by default (25 max).',
      },
    ],
  },
  {
    category: 'General',
    emoji: '💬',
    items: [
      {
        q: 'Is TribePicks free?',
        a: (
          <>
            Yes — tipping, brackets, joining comps, and entering challenges (including sponsored prize draws) are all completely free. A one-off Pro upgrade adds extra features:{' '}
            <a href="/pro/tipster" className="text-emerald-600 underline hover:text-emerald-700">Pro for Tipsters</a> unlocks your player stats — tip review, head-to-head, your tipster persona and an ad-free tournament — while{' '}
            <a href="/pro/comp-chief" className="text-emerald-600 underline hover:text-emerald-700">Pro for Comp Chiefs</a> adds organiser tools like auto-reminders, email campaigns and payment tracking (and includes Tipster Pro).
          </>
        ),
      },
      {
        q: 'Is TribePicks affiliated with FIFA?',
        a: 'No. TribePicks is an unofficial fan competition platform and is not affiliated with, endorsed by, or connected to FIFA in any way.',
      },
      {
        q: 'How do I report a bug or give feedback?',
        a: 'Use the feedback button in the bottom-right corner of any page, or email us directly. We read every message.',
      },
    ],
  },
]

function AccordionItem({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-3 py-3.5 px-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-800">{q}</span>
        <span className={clsx('text-gray-400 transition-transform flex-shrink-0 text-xs', open && 'rotate-180')}>▼</span>
      </button>
      {/* Always render the answer into the DOM (crawlable in the SSR HTML), just
          collapse it visually when closed — conditional mounting hid it from search. */}
      <div className={clsx('px-4 pb-4', !open && 'hidden')}>
        <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

export default function FaqContent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="text-sm text-gray-500 mt-1">Everything you need to know about TribePicks and WC 2026.</p>
      </div>

      <div className="space-y-4">
        {FAQS.map(section => (
          <div key={section.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-base leading-none">{section.emoji}</span>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{section.category}</h2>
            </div>
            {section.items.map(item => (
              <AccordionItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-8">
        Still have questions?{' '}
        <a href="mailto:tribepicks@gmail.com" className="underline hover:text-gray-600 transition-colors">
          Get in touch
        </a>
      </p>
    </div>
  )
}
