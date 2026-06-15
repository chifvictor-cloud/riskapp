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
