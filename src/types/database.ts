export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          fortnite_username: string | null
          balance: number
          total_earnings: number
          wins: number
          losses: number
          points: number
          is_admin: boolean
          is_vip: boolean
          vip_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          fortnite_username?: string | null
          balance?: number
          total_earnings?: number
          wins?: number
          losses?: number
          points?: number
          is_vip?: boolean
          vip_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          fortnite_username?: string | null
          balance?: number
          total_earnings?: number
          wins?: number
          losses?: number
          points?: number
          is_vip?: boolean
          vip_expires_at?: string | null
          updated_at?: string
        }
      }
      tournaments: {
        Row: {
          id: string
          title: string
          description: string | null
          game_mode: string
          entry_fee: number
          prize_pool: number
          max_players: number
          current_players: number
          status: 'open' | 'in_progress' | 'completed' | 'cancelled'
          rules: string | null
          created_by: string | null
          winner_id: string | null
          starts_at: string | null
          ends_at: string | null
          is_creator: boolean
          stream_url: string | null
          chat_pot_enabled: boolean
          chat_pot_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          game_mode?: string
          entry_fee: number
          prize_pool: number
          max_players?: number
          current_players?: number
          status?: 'open' | 'in_progress' | 'completed' | 'cancelled'
          rules?: string | null
          created_by?: string | null
          winner_id?: string | null
          starts_at?: string | null
          ends_at?: string | null
          is_creator?: boolean
          stream_url?: string | null
          chat_pot_enabled?: boolean
          chat_pot_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          game_mode?: string
          entry_fee?: number
          prize_pool?: number
          max_players?: number
          current_players?: number
          status?: 'open' | 'in_progress' | 'completed' | 'cancelled'
          rules?: string | null
          winner_id?: string | null
          starts_at?: string | null
          ends_at?: string | null
          is_creator?: boolean
          stream_url?: string | null
          chat_pot_enabled?: boolean
          chat_pot_amount?: number
          updated_at?: string
        }
      }
      tournament_participants: {
        Row: {
          id: string
          tournament_id: string
          player_id: string
          status: 'registered' | 'ready' | 'playing' | 'eliminated' | 'winner'
          epic_username: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          player_id: string
          status?: 'registered' | 'ready' | 'playing' | 'eliminated' | 'winner'
          epic_username?: string | null
          joined_at?: string
        }
        Update: {
          status?: 'registered' | 'ready' | 'playing' | 'eliminated' | 'winner'
          epic_username?: string | null
        }
      }
      matches: {
        Row: {
          id: string
          tournament_id: string
          player1_id: string
          player2_id: string
          winner_id: string | null
          player1_score: number
          player2_score: number
          status: 'pending' | 'in_progress' | 'completed' | 'disputed'
          played_at: string | null
          created_at: string
          player1_claimed_winner: string | null
          player2_claimed_winner: string | null
          player1_screenshot_url: string | null
          player2_screenshot_url: string | null
          admin_note: string | null
          resolved_by: string | null
          resolved_at: string | null
          spectator_count: number
          sponsor_id: string | null
        }
        Insert: {
          id?: string
          tournament_id: string
          player1_id: string
          player2_id: string
          winner_id?: string | null
          player1_score?: number
          player2_score?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'disputed'
          played_at?: string | null
          created_at?: string
          player1_claimed_winner?: string | null
          player2_claimed_winner?: string | null
          player1_screenshot_url?: string | null
          player2_screenshot_url?: string | null
          admin_note?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          spectator_count?: number
          sponsor_id?: string | null
        }
        Update: {
          winner_id?: string | null
          player1_score?: number
          player2_score?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'disputed'
          played_at?: string | null
          player1_claimed_winner?: string | null
          player2_claimed_winner?: string | null
          player1_screenshot_url?: string | null
          player2_screenshot_url?: string | null
          admin_note?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          spectator_count?: number
          sponsor_id?: string | null
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: 'deposit' | 'withdrawal' | 'entry_fee' | 'prize' | 'refund'
          amount: number
          status: 'pending' | 'completed' | 'failed' | 'cancelled'
          reference_id: string | null
          description: string | null
          recipient: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'deposit' | 'withdrawal' | 'entry_fee' | 'prize' | 'refund'
          amount: number
          status?: 'pending' | 'completed' | 'failed' | 'cancelled'
          reference_id?: string | null
          description?: string | null
          recipient?: string | null
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'completed' | 'failed' | 'cancelled'
          reference_id?: string | null
          recipient?: string | null
        }
      }
      spectator_sessions: {
        Row: {
          id: string
          match_id: string
          user_id: string
          voted_for: string | null
          joined_at: string
          left_at: string | null
          points_earned: number
        }
        Insert: {
          id?: string
          match_id: string
          user_id: string
          voted_for?: string | null
          joined_at?: string
          left_at?: string | null
          points_earned?: number
        }
        Update: {
          voted_for?: string | null
          left_at?: string | null
          points_earned?: number
        }
      }
      spectator_chat_messages: {
        Row: {
          id: string
          match_id: string
          user_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          match_id: string
          user_id: string
          content: string
          created_at?: string
        }
        Update: {
          content?: string
        }
      }
      sponsors: {
        Row: {
          id: string
          tournament_id: string
          player_id: string
          sponsor_id: string
          amount: number
          status: 'active' | 'won' | 'lost'
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          player_id: string
          sponsor_id: string
          amount: number
          status?: 'active' | 'won' | 'lost'
          created_at?: string
        }
        Update: {
          status?: 'active' | 'won' | 'lost'
        }
      }
      store_products: {
        Row: {
          id: string
          name: string
          description: string | null
          category: 'fortnite' | 'tarjetas' | 'merch'
          points_cost: number
          image_url: string | null
          stock: number | null
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          category: 'fortnite' | 'tarjetas' | 'merch'
          points_cost: number
          image_url?: string | null
          stock?: number | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          category?: 'fortnite' | 'tarjetas' | 'merch'
          points_cost?: number
          image_url?: string | null
          stock?: number | null
          is_active?: boolean
          sort_order?: number
        }
      }
      store_redemptions: {
        Row: {
          id: string
          user_id: string
          product_id: string
          points_spent: number
          status: 'pending' | 'fulfilled' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          points_spent: number
          status?: 'pending' | 'fulfilled' | 'cancelled'
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'fulfilled' | 'cancelled'
        }
      }
    }
  }
}
