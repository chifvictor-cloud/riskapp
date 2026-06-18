import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import WithdrawClient from './WithdrawClient'
import { ArrowUpRight } from 'lucide-react'

export const metadata = { title: 'Retirar — RISK' }

export default async function WithdrawPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  const balance = (profileRaw as { balance: number } | null)?.balance ?? 0

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-24 pb-16">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ArrowUpRight size={24} className="text-[#8b5cf6]" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Retirar ganancias</h1>
          <p className="text-[#555] text-sm">
            Transfiere tu balance directamente a tu cuenta de MercadoPago
          </p>
        </div>

        <WithdrawClient balance={balance} />

      </main>
    </div>
  )
}
