import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { CheckCircle, Wallet, ArrowRight } from 'lucide-react'

export const metadata = { title: 'Pago exitoso — RISK' }

export default function DepositSuccessPage() {
  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-md mx-auto px-4 pt-32 pb-16 text-center">

        <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={36} className="text-green-400" />
        </div>

        <h1 className="text-3xl font-black text-white mb-3">Pago recibido</h1>
        <p className="text-[#888] text-sm mb-2">
          Tu depósito fue procesado con éxito por MercadoPago.
        </p>
        <p className="text-[#555] text-xs mb-8">
          El saldo se reflejará en tu cuenta en unos segundos.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            <Wallet size={16} />
            Ver mi balance
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/tournaments"
            className="flex items-center justify-center gap-2 border border-[#272454] hover:border-[#8b5cf6]/40 text-[#888] hover:text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            Ir a torneos
          </Link>
        </div>

      </main>
    </div>
  )
}
