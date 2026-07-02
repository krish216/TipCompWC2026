// Sponsor Campaigns module — shared types.

export type SponsorStatus = 'lead' | 'active' | 'archived'
export type ChallengeType = 'bracket' | 'four_pick' | 'match'
export type LogoTone      = 'dark' | 'light'
export type CampaignStatus = 'disabled' | 'scheduled' | 'live' | 'ended'

export interface Sponsor {
  id:            string
  slug:          string
  name:          string
  contact_name:  string | null
  contact_email: string | null
  phone:         string | null
  website_url:   string | null
  logo_url:      string | null
  logo_tone:     LogoTone
  brand_color:   string | null   // banner background hex (co-branded leaderboard)
  tagline:       string | null   // banner subtitle / location line (subsidiary/franchise)
  logo_includes_name: boolean    // logo is a wordmark → don't print the name as text
  status:        SponsorStatus
  notes:         string | null
  created_at:    string
  updated_at:    string
}

export interface Challenge {
  id:            string
  tournament_id: string
  type:          ChallengeType
  name:          string
  enabled:       boolean
}

export interface SponsorCampaign {
  id:           string
  sponsor_id:   string
  challenge_id: string
  prize:        string | null
  prize_1:      string | null
  prize_2:      string | null
  prize_3:      string | null
  click_url:    string | null
  logo_tone:    LogoTone | null
  starts_at:    string | null
  ends_at:      string | null
  enabled:      boolean
  created_at:   string
  updated_at:   string
}

// The stable shape the bracket header + insert consume. Kept identical to the
// legacy /api/bracket/config response so consuming UI needs no changes.
export interface ResolvedSponsorConfig {
  enabled:             boolean
  sponsor_name:        string
  sponsor_logo:        string
  prize:               string           // headline / total prize (the hero "Win X")
  prize_1:             string           // 1st-place prize ('' when unset)
  prize_2:             string           // 2nd-place prize ('' when unset)
  prize_3:             string           // 3rd-place prize ('' when unset)
  sponsor_url:         string
  logo_tone:           LogoTone
  sponsor_brand_color: string | null   // banner background hex; null → default treatment
  sponsor_tagline:     string | null   // banner subtitle / location line (subsidiary/franchise)
  logo_includes_name:  boolean         // logo is a wordmark → suppress the name text
}
