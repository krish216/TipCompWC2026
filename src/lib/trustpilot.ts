// Trustpilot review collection link.
//
// This is the public "evaluate" URL — anyone can leave a service review here, no
// API or auth needed. Confirm the exact link in your Trustpilot dashboard
// ("Get reviews" → share a review link); the standard format is
// trustpilot.com/evaluate/<your-domain>. To switch to per-customer tracking
// later, swap this for an Invitation-API link (trustpilot.com/evaluate-link/<id>).
export const TRUSTPILOT_REVIEW_URL = 'https://www.trustpilot.com/evaluate/tribepicks.com'

// Promoters (NPS 9–10) are the right — and only — audience to ask for a public
// review. Passives/detractors should never see the review CTA.
export const isPromoter = (score: number | null | undefined): boolean => score != null && score >= 9
