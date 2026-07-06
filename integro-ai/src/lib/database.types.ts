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
      prospects: {
        Row: {
          id: string
          user_id: string
          first_name: string
          last_name: string
          email: string
          title: string
          company: string
          website: string | null
          source: string
          external_id: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          first_name?: string
          last_name?: string
          email: string
          title?: string
          company?: string
          website?: string | null
          source?: string
          external_id?: string | null
          status?: string
        }
        Update: Partial<Database['public']['Tables']['prospects']['Insert']>
      }
      sequences: {
        Row: {
          id: string
          user_id: string
          name: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          status?: string
        }
        Update: Partial<Database['public']['Tables']['sequences']['Insert']>
      }
      sequence_steps: {
        Row: {
          id: string
          user_id: string
          sequence_id: string
          step_order: number
          type: string
          delay_days: number
          subject: string
          body: string
        }
        Insert: {
          id?: string
          user_id: string
          sequence_id: string
          step_order?: number
          type?: string
          delay_days?: number
          subject?: string
          body?: string
        }
        Update: Partial<Database['public']['Tables']['sequence_steps']['Insert']>
      }
      enrollments: {
        Row: {
          id: string
          user_id: string
          sequence_id: string
          prospect_id: string
          current_step: number
          status: string
          enrolled_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          sequence_id: string
          prospect_id: string
          current_step?: number
          status?: string
        }
        Update: Partial<Database['public']['Tables']['enrollments']['Insert']>
      }
      messages: {
        Row: {
          id: string
          user_id: string
          prospect_id: string | null
          sequence_id: string | null
          enrollment_id: string | null
          step_id: string | null
          channel: string
          subject: string
          body: string
          status: string
          generated_by: string
          mailbox: string | null
          provider_msg_id: string | null
          error: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          prospect_id?: string | null
          sequence_id?: string | null
          enrollment_id?: string | null
          step_id?: string | null
          channel?: string
          subject?: string
          body?: string
          status?: string
          generated_by?: string
          mailbox?: string | null
          provider_msg_id?: string | null
          error?: string | null
          sent_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      agent_runs: {
        Row: {
          id: string
          user_id: string
          agent: string
          kind: string
          status: string
          item_count: number
          meta: Json
          error: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          agent?: string
          kind: string
          status?: string
          item_count?: number
          meta?: Json
          error?: string | null
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['agent_runs']['Insert']>
      }
    }
  }
}
