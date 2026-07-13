'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

export async function buyFrameTier(targetTier: number) {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('buy_frame_tier', {
    p_target_tier: targetTier,
  })
  if (error) return { error: error.message }
  if (data?.error) {
    const messages: Record<string, string> = {
      not_authenticated:    'Inicia sesión de nuevo',
      invalid_tier:         'Marco no válido',
      tier_not_purchasable: 'Este marco no se puede comprar',
      profile_not_found:    'Perfil no encontrado',
      tier_already_owned:   'Ya tienes este marco o uno superior',
      insufficient_points:  'No tienes suficientes puntos',
    }
    return { error: messages[data.error] ?? data.error }
  }
  revalidatePath('/store')
  return {
    success: true as const,
    newTier: data.new_tier as number,
    pointsSpent: data.points_spent as number,
  }
}
