import type { Metadata } from 'next'
import { PollsClient } from './PollsClient'

// A transient campaign/feedback utility page — keep it out of the search index.
export const metadata: Metadata = {
  title: 'Quick questions — TribePicks',
  description: 'Answer a couple of quick TribePicks questions — your input shapes what we build next.',
  robots: { index: false, follow: true },
}

// Generic poll landing. ?topic=<t> shows a campaign's set (e.g. feedback, codesign);
// ?id=<uuid> deep-links a single poll; bare shows all the user's eligible active polls.
// Audience gating is handled by /api/polls, so a non-eligible visitor just sees none.
export default function PollsPage({ searchParams }: { searchParams: { topic?: string; id?: string } }) {
  return <PollsClient topic={searchParams.topic ?? null} pollId={searchParams.id ?? null} />
}
