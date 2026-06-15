import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import StoreClient from './StoreClient'
import { ShoppingBag } from 'lucide-react'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

export default async function StorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [
    { data: profileRaw },
    { data: productsRaw },
    { data: redemptionsRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single() as unknown as Promise<{ data: Profile | null }>,
    (supabase as any)
      .from('store_products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    (supabase as any)
      .from('store_redemptions')
      .select('id, product_id, points_spent, status, created_at, store_products(name, category)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const profile = profileRaw as Profile | null
  if (!profile) redirect('/auth/login')

  const products = (productsRaw ?? []) as any[]
  const redemptions = (redemptionsRaw ?? []) as any[]

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-[#8b5cf6]/10 rounded-xl flex items-center justify-center">
            <ShoppingBag size={20} className="text-[#8b5cf6]" />
          </div>
          <div>
            <p className="text-[#8b5cf6] text-xs font-bold uppercase tracking-widest mb-0.5">Canjea tus puntos</p>
            <h1 className="text-3xl font-black text-white leading-none">Tienda de Puntos</h1>
          </div>
        </div>

        <StoreClient
          userPoints={profile.points}
          isVip={profile.is_vip ?? false}
          products={products}
          initialRedemptions={redemptions}
        />
      </main>
    </div>
  )
}
