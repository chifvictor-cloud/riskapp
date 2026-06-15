'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitMatchResult(
  matchId: string,
  claimedWinnerId: string,
  screenshotUrl: string | null,
) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('submit_match_result', {
    p_match_id:       matchId,
    p_claimed_winner: claimedWinnerId,
    p_screenshot_url: screenshotUrl,
  })

  if (error) return { error: error.message as string }
  if (data?.error) {
    const messages: Record<string, string> = {
      not_authenticated:  'Debes iniciar sesión',
      match_not_found:    'Partida no encontrada',
      match_not_active:   'Esta partida ya no está activa',
      not_a_participant:  'No eres participante de esta partida',
      invalid_winner:     'Ganador inválido',
      already_reported:   'Ya reportaste el resultado de esta partida',
    }
    return { error: messages[data.error] ?? (data.error as string) }
  }

  revalidatePath(`/match/${matchId}`)
  revalidatePath('/dashboard')
  revalidatePath('/tournaments')

  return {
    success: true as const,
    resultStatus: data?.result_status as 'pending_opponent' | 'completed' | 'disputed',
    winnerId: data?.winner_id as string | null,
  }
}

export async function spectateVote(matchId: string, votedFor: string) {
  const supabase = await createClient()
  const { error } = await (supabase as any).rpc('vote_for_player', {
    p_match_id: matchId,
    p_voted_for: votedFor,
  })
  if (error) return { error: error.message as string }
  return { success: true as const }
}

export async function sponsorPlayer(tournamentId: string, playerId: string) {
  const supabase = await createClient()
  const { error } = await (supabase as any).rpc('sponsor_player', {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
  })
  if (error) {
    const messages: Record<string, string> = {
      tournament_not_found: 'Torneo no encontrado',
      tournament_not_open:  'El torneo ya no está abierto',
      cannot_sponsor_own:   'No puedes patrocinar tu propio torneo',
      already_sponsored:    'Este jugador ya tiene un patrocinador',
      insufficient_balance: 'Balance insuficiente para patrocinar',
    }
    return { error: messages[error.message] ?? error.message }
  }
  revalidatePath(`/tournaments/${tournamentId}`)
  return { success: true as const }
}

export async function redeemProduct(productId: string) {
  const supabase = await createClient()
  const { error } = await (supabase as any).rpc('redeem_product', {
    p_product_id: productId,
  })
  if (error) {
    const messages: Record<string, string> = {
      product_not_found:   'Producto no encontrado',
      out_of_stock:        'Producto sin stock',
      insufficient_points: 'No tienes suficientes puntos',
    }
    return { error: messages[error.message] ?? error.message }
  }
  revalidatePath('/store')
  revalidatePath('/profile')
  return { success: true as const }
}
