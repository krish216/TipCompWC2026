export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row:    { id: string; email: string; display_name: string; avatar_url: string | null; tribe_id: string | null; favourite_team: string | null; country: string | null; timezone: string | null; org_id: string | null; created_at: string; updated_at: string }
        Insert: { id: string; email: string; display_name: string; avatar_url?: string | null; tribe_id?: string | null; favourite_team?: string | null; country?: string | null; timezone?: string | null; org_id?: string | null }
        Update: { email?: string; display_name?: string; avatar_url?: string | null; tribe_id?: string | null; favourite_team?: string | null; country?: string | null; timezone?: string | null; org_id?: string | null }
      }
      organisations: {
        Row:    { id: string; name: string; slug: string; invite_code: string; created_by: string | null; created_at: string }
        Insert: { name: string; slug: string; created_by?: string | null }
        Update: { name?: string; slug?: string }
      }
      org_admins: {
        Row:    { org_id: string; user_id: string; granted_at: string }
        Insert: { org_id: string; user_id: string }
        Update: never
      }
      tribes: {
        Row:    { id: string; name: string; invite_code: string; created_by: string; created_at: string }
        Insert: { name: string; created_by: string }
        Update: { name?: string }
      }
      tribe_members: {
        Row:    { user_id: string; tribe_id: string; joined_at: string }
        Insert: { user_id: string; tribe_id: string }
        Update: never
      }
      fixtures: {
        Row:    { id: number; round: string; grp: string | null; home: string; away: string; kickoff_utc: string; venue: string; home_score: number | null; away_score: number | null; result_set_at: string | null; result_set_by: string | null }
        Insert: { id?: number; round: string; grp?: string | null; home: string; away: string; kickoff_utc: string; venue: string }
        Update: { home?: string; away?: string; home_score?: number | null; away_score?: number | null; result_set_at?: string | null; result_set_by?: string | null }
      }
      predictions: {
        Row:    { id: number; user_id: string; fixture_id: number; home: number; away: number; points_earned: number | null; created_at: string; updated_at: string }
        Insert: { user_id: string; fixture_id: number; home: number; away: number; points_earned?: number | null }
        Update: { home?: number; away?: number; points_earned?: number | null; updated_at?: string }
      }
      chat_messages: {
        Row:    { id: string; tribe_id: string; user_id: string; content: string; fixture_id: number | null; created_at: string }
        Insert: { tribe_id: string; user_id: string; content: string; fixture_id?: number | null }
        Update: never
      }
      admin_users: {
        Row:    { user_id: string; granted_by: string | null; granted_at: string }
        Insert: { user_id: string; granted_by?: string | null }
        Update: { granted_by?: string | null }
      }
      notification_prefs: {
        Row:    { user_id: string; push_enabled: boolean; email_enabled: boolean; tribe_nudges: boolean; updated_at: string }
        Insert: { user_id: string; push_enabled?: boolean; email_enabled?: boolean; tribe_nudges?: boolean }
        Update: { push_enabled?: boolean; email_enabled?: boolean; tribe_nudges?: boolean }
      }
    }
    Views: {
      leaderboard: {
        Row: { user_id: string; display_name: string; tribe_name: string | null; total_points: number; exact_count: number; correct_count: number; predictions_made: number }
      }
    }
    Functions: {}
    Enums: {
      round_id: 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'f'
    }
  }
}
