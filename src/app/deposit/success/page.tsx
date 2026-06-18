import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { CheckCircle, Wallet, ArrowRight, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { verifyAndCredit } from '@/lib/payments/verifyAndCredit'

export const metadata = { title: 'Pago exitoso — RISK' }

export default async function DepositSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const paymentId = (sp.payment_id ?? sp.collection_id) as string | undefined

  let creditResult: Awaited<ReturnType<typeof verifyAndCredit>> | null = null

  if (paymentId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      creditResult = await verifyAndCredit(paymentId, user.id)
    }
  }

  const success = creditResult?.ok === true
  const alreadyProcessed = success && !(creditResult as any).credited

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-md mx-auto px-4 pt-32 pb-16 text-center">

        {success ? (
          <>
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-400" />
            </div>
            <h1 className="text-3xl font-black text-white mb-3">Pago recibido</h1>
            <p className="text-[#888] text-sm mb-2">
              Tu depósito fue procesado con éxito por MercadoPago.
            </p>
            {alreadyProcessed ? (
              <p className="text-[#555] text-xs mb-8">
                El saldo ya había sido acreditado anteriormente.
              </p>
            ) : (
              <p className="text-green-400/70 text-xs mb-8">
                +${(creditResult as any).amount} MXN acreditados a tu cuenta.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-yellow-500/10 border border-yellow-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={36} className="text-yellow-400" />
            </div>
            <h1 className="text-3xl font-black text-white mb-3">Pago en proceso</h1>
            <p className="text-[#888] text-sm mb-2">
              MercadoPago recibió tu pago. El saldo se reflejará en tu cuenta en unos minutos.
            </p>
            <p className="text-[#555] text-xs mb-8">
              Si no se acredita en 5 minutos, contacta soporte.
            </p>
          </>
        )}

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
