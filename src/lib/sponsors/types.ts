// Sponsor Campaigns module — shared types.

export type SponsorStatus = 'lead' | 'active' | 'archived'
export type ChallengeType = 'bracket' | 'four_pick'
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
  enabled:      boolean
  sponsor_name: string
  sponsor_logo: string
  prize:        string
  sponsor_url:  string
  logo_tone:    LogoTone
}
