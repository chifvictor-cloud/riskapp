'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function joinTournament(tournamentId: string, epicUsername: string) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('join_tournament', {
    p_tournament_id: tournamentId,
    p_epic_username: epicUsername,
  })

  if (error) return { error: error.message as string }
  if (data?.error) {
    const messages: Record<string, string> = {
      insufficient_balance: 'Balance insuficiente para unirte a este torneo',
      tournament_full: 'El torneo ya está lleno',
      already_joined: 'Ya estás participando en este torneo',
      tournament_not_open: 'Este torneo ya no está disponible',
      cannot_join_own: 'No puedes unirte a tu propio torneo',
      not_authenticated: 'Debes iniciar sesión primero',
    }
    return { error: messages[data.error] ?? (data.error as string) }
  }

  revalidatePath(`/tournaments/${tournamentId}`)
  revalidatePath('/dashboard')
  return {
    success: true as const,
    matched: !!(data?.matched),
    matchId: data?.match_id as string | null,
    rivalEpic: data?.rival_epic as string | null,
    rivalId: data?.rival_id as string | null,
  }
}

export async function reportMatchResult(matchId: string, winnerId: string) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('report_match_result', {
    p_match_id: matchId,
    p_winner_id: winnerId,
  })

  if (error) return { error: error.message as string }
  if (data?.error) return { error: data.error as string }

  revalidatePath('/tournaments')
  revalidatePath('/dashboard')
  return { success: true as const, prize: data?.prize as number }
}

export async function createTournament(
  entryFee: number,
  gameMode: string,
  epicUsername: string,
  creatorOptions?: {
    isCreator: boolean
    streamUrl?: string
    chatPotEnabled?: boolean
  },
) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('create_tournament', {
    p_entry_fee: entryFee,
    p_game_mode: gameMode,
    p_epic_username: epicUsername,
  })

  if (error) return { error: error.message as string }
  if (data?.error) {
    const messages: Record<string, string> = {
      insufficient_balance: 'No tienes suficiente balance para crear este torneo',
      invalid_format: 'Formato de torneo inválido',
      invalid_entry_fee: 'Cuota de entrada inválida',
      not_authenticated: 'Debes iniciar sesión primero',
    }
    return { error: messages[data.error] ?? (data.error as string) }
  }

  const tournamentId = data?.tournament_id as string

  // Post-creation: apply creator options if provided
  if (creatorOptions?.isCreator && tournamentId) {
    await supabase.from('tournaments').update({
      is_creator: true,
      stream_url: creatorOptions.streamUrl?.trim() || null,
      chat_pot_enabled: creatorOptions.chatPotEnabled ?? false,
    }).eq('id', tournamentId)
  }

  revalidatePath('/tournaments')
  revalidatePath('/dashboard')
  return { success: true as const, tournamentId }
}
