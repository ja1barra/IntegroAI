export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          name: string
          initials: string
          role: string
          org: string
          created_at: string
        }
        Insert: {
          id: string
          name?: string
          initials?: string
          role?: string
          org?: string
          created_at?: string
        }
        Update: {
          name?: string
          initials?: string
          role?: string
          org?: string
        }
      }
      user_settings: {
        Row: {
          user_id: string
          agent_states: Json
          tweaks: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          agent_states?: Json
          tweaks?: Json
          updated_at?: string
        }
        Update: {
          agent_states?: Json
          tweaks?: Json
          updated_at?: string
        }
      }
    }
  }
}
