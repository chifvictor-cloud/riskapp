import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { XCircle } from 'lucide-react'

export const metadata = { title: 'Pago cancelado — RISK' }

export default function DepositFailurePage() {
  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-md mx-auto px-4 pt-32 pb-16 text-center">

        <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <XCircle size={36} className="text-red-400" />
        </div>

        <h1 className="text-3xl font-black text-white mb-3">Pago no completado</h1>
        <p className="text-[#888] text-sm mb-8">
          El pago fue cancelado o rechazado. No se realizó ningún cargo.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/deposit"
            className="flex items-center justify-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            Intentar de nuevo
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 border border-[#272454] text-[#888] hover:text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            Volver al dashboard
          </Link>
        </div>

      </main>
    </div>
  )
}
