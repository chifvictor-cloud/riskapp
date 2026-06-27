'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function resolveDispute(matchId: string, winnerId: string, note: string) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('admin_resolve_dispute', {
    p_match_id:  matchId,
    p_winner_id: winnerId,
    p_note:      note || null,
  })

  if (error) return { error: error.message as string }
  if (data?.error) {
    const messages: Record<string, string> = {
      not_authenticated: 'No autenticado',
      not_authorized:    'No tienes permisos de administrador',
      match_not_found:   'Partida no encontrada',
      match_not_disputed:'Esta partida no está en disputa',
      invalid_winner:    'Ganador inválido',
    }
    return { error: messages[data.error] ?? (data.error as string) }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
  return { success: true as const, winnerId: data?.winner_id as string, prize: data?.prize as number }
}

export async function completeWithdrawal(txId: string) {
  const supabase = await createClient()
  const { error } = await (supabase as any).rpc('admin_complete_withdrawal', { p_tx_id: txId })
  if (error) return { error: error.message as string }
  revalidatePath('/admin')
  return { success: true as const }
}

export async function rejectWithdrawal(txId: string) {
  const supabase = await createClient()
  const { error } = await (supabase as any).rpc('admin_reject_withdrawal', { p_tx_id: txId })
  if (error) return { error: error.message as string }
  revalidatePath('/admin')
  return { success: true as const }
}
