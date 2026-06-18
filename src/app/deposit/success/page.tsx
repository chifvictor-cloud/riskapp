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

  let userId: string | null = null
  let creditResult: Awaited<ReturnType<typeof verifyAndCredit>> | null = null

  if (paymentId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null

    if (user) {
      creditResult = await verifyAndCredit(paymentId, user.id)
    }
  }

  const success = creditResult?.ok === true
  const alreadyProcessed = success && !(creditResult as any).credited

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-lg mx-auto px-4 pt-32 pb-16 text-center">

        {success ? (
          <>
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-400" />
            </div>
            <h1 className="text-3xl font-black text-white mb-3">Pago recibido</h1>
            {alreadyProcessed ? (
              <p className="text-[#555] text-xs mb-8">El saldo ya había sido acreditado anteriormente.</p>
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
            <p className="text-[#888] text-sm mb-8">
              El saldo se reflejará en tu cuenta en unos minutos.
            </p>
          </>
        )}

        <div className="flex flex-col gap-3 mb-10">
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

        {/* DEBUG PANEL — remove once balance crediting works */}
        <div className="text-left border border-[#ff6b35]/30 rounded-xl bg-[#ff6b35]/5 p-4 text-xs font-mono">
          <p className="text-[#ff6b35] font-bold mb-3 uppercase tracking-wide">Debug — quitar cuando funcione</p>

          <p className="text-[#888] mb-1">Query params de MP:</p>
          <pre className="text-[#ccc] mb-4 whitespace-pre-wrap break-all">
            {JSON.stringify(sp, null, 2)}
          </pre>

          <p className="text-[#888] mb-1">payment_id extraído: <span className="text-white">{paymentId ?? 'NINGUNO'}</span></p>
          <p className="text-[#888] mb-4">userId autenticado: <span className="text-white">{userId ?? 'NO AUTENTICADO'}</span></p>

          <p className="text-[#888] mb-1">Resultado de verifyAndCredit:</p>
          <pre className="text-[#ccc] whitespace-pre-wrap break-all">
            {creditResult ? JSON.stringify(creditResult, null, 2) : 'no se llamó (falta payment_id o usuario)'}
          </pre>
        </div>

      </main>
    </div>
  )
}
