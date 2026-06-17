'use client'

import { useState } from 'react'
import { Wallet, CreditCard, Loader2, ChevronRight, Shield } from 'lucide-react'

const PRESET_AMOUNTS = [50, 100, 200, 500, 1000]

export default function DepositClient({ userEmail }: { userEmail: string }) {
  const [selected, setSelected] = useState<number | null>(100)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const amount = custom ? Number(custom) : selected

  const handleDeposit = async () => {
    if (!amount || amount < 50) {
      setError('El mínimo de depósito es $50 MXN')
      return
    }
    if (amount > 10000) {
      setError('El máximo de depósito es $10,000 MXN')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al iniciar el pago')
        return
      }

      // Use sandbox_init_point in dev, init_point in prod
      const url = process.env.NODE_ENV === 'production'
        ? data.init_point
        : data.sandbox_init_point

      window.location.href = url
    } catch {
      setError('Error de conexión, intenta de nuevo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">

      {/* Amount selector */}
      <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl p-6 mb-4">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <Wallet size={16} className="text-[#8b5cf6]" />
          Selecciona el monto
        </h2>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {PRESET_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => { setSelected(v); setCustom('') }}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${
                selected === v && !custom
                  ? 'bg-[#8b5cf6] text-white shadow-[0_0_16px_rgba(139,92,246,0.3)]'
                  : 'bg-[#08071a] border border-[#272454] text-[#888] hover:border-[#8b5cf6]/50 hover:text-white'
              }`}
            >
              ${v}
            </button>
          ))}
          <button
            onClick={() => { setSelected(null); setCustom('') }}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              custom !== '' || selected === null && custom === ''
                ? 'bg-[#8b5cf6] text-white'
                : 'bg-[#08071a] border border-[#272454] text-[#888] hover:border-[#8b5cf6]/50 hover:text-white'
            } ${custom !== '' ? 'bg-[#8b5cf6] text-white' : ''}`}
          >
            Otro
          </button>
        </div>

        {(selected === null || custom !== '') && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888] font-bold">$</span>
            <input
              type="number"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Escribe el monto"
              min={50}
              max={10000}
              className="w-full bg-[#08071a] border border-[#272454] focus:border-[#8b5cf6] rounded-xl px-8 py-3 text-white font-bold text-sm outline-none transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] text-xs">MXN</span>
          </div>
        )}
      </div>

      {/* Summary */}
      {amount && amount >= 50 && (
        <div className="bg-[#0f0e2a] border border-[#272454] rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#888]">Depósito</span>
            <span className="text-white font-bold">${amount.toFixed(2)} MXN</span>
          </div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-[#888]">Comisión MP</span>
            <span className="text-[#555]">Incluida</span>
          </div>
          <div className="border-t border-[#1e1b4b] pt-3 flex justify-between">
            <span className="text-white font-bold">Recibirás en balance</span>
            <span className="text-[#8b5cf6] font-black">${amount.toFixed(2)} MXN</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Pay button */}
      <button
        onClick={handleDeposit}
        disabled={loading || !amount || amount < 50}
        className="w-full flex items-center justify-center gap-3 bg-[#009ee3] hover:bg-[#008ec9] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-colors shadow-[0_0_24px_rgba(0,158,227,0.2)] text-base"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <CreditCard size={18} />
        )}
        {loading ? 'Redirigiendo...' : `Pagar $${amount ?? 0} MXN con MercadoPago`}
        {!loading && <ChevronRight size={16} />}
      </button>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-4 mt-5 text-[#444] text-xs">
        <div className="flex items-center gap-1.5">
          <Shield size={12} className="text-[#555]" />
          Pago 100% seguro
        </div>
        <span>·</span>
        <span>Acreditación inmediata</span>
        <span>·</span>
        <span>{userEmail}</span>
      </div>

    </div>
  )
}
