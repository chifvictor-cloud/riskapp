import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import MisApuestas from '@/components/MisApuestas'
import { TrendingUp } from 'lucide-react'

export default async function MisApuestasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-[#e85d24]/10 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-[#e85d24]" />
          </div>
          <div>
            <p className="text-[#e85d24] text-xs font-bold uppercase tracking-widest mb-0.5">Historial completo</p>
            <h1 className="text-3xl font-black text-white leading-none">Mis Apuestas</h1>
          </div>
        </div>

        <MisApuestas />
      </main>
    </div>
  )
}
