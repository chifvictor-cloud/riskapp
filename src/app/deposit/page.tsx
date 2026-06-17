import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import DepositClient from './DepositClient'
import { Wallet } from 'lucide-react'

export const metadata = { title: 'Depositar — RISK' }

export default async function DepositPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-24 pb-16">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wallet size={24} className="text-[#8b5cf6]" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Depositar saldo</h1>
          <p className="text-[#555] text-sm">
            Recarga tu balance para entrar a torneos y apuestas
          </p>
        </div>

        <DepositClient userEmail={user.email ?? ''} />

      </main>
    </div>
  )
}
