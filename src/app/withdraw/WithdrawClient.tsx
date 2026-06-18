'use client'

import { useState } from 'react'
import { ArrowUpRight, Wallet, Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react'

const PRESET_AMOUNTS = [50, 100, 200, 500]

export default function WithdrawClient({ balance }: { balance: number }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [recipient, setRecipient] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ amount: number; recipient: string } | null>(null)

  const amount = custom ? Number(custom) : selected

  const handleWithdraw = async () => {
    if (!amount || amount < 50) {
      setError('El mínimo de retiro es $50 MXN')
      return
    }
    if (amount > balance) {
      setError('Balance insuficiente')
      return
    }
    if (!recipient || !recipient.includes('@')) {
      setError('Ingresa el email de tu cuenta de MercadoPago')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/withdrawals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, recipient }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al procesar el retiro')
        return
      }

      setSuccess({ amount, recipient })
    } catch {
      setError('Error de conexión, intenta de nuevo')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-[#0f0e2a] border border-[#8b5cf6]/20 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <h2 className="text-white font-black text-2xl mb-2">¡Retiro exitoso!</h2>
          <p className="text-[#888] text-sm mb-6">La transferencia fue procesada correctamente</p>

          <div className="bg-[#08071a] border border-[#1e1b4b] rounded-xl p-4 mb-6 space-y-3 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-[#888]">Monto transferido</span>
              <span className="text-green-400 font-black">${success.amount.toFixed(2)} MXN</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#888]">Cuenta MercadoPago</span>
              <span className="text-white font-mono text-xs truncate max-w-[180px]">{success.recipient}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#888]">Estado</span>
              <span className="text-green-400 font-bold">Completado</span>
            </div>
          </div>

          <button
            onClick={() => { setSuccess(null); setSelected(null); setCustom(''); setRecipient('') }}
            className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            Hacer otro retiro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">

      {/* Balance display */}
      <div className="bg-[#0f0e2a] border border-[#8b5cf6]/25 rounded-2xl p-5 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#8b5cf6]/10 rounded-xl flex items-center justify-center">
            <Wallet size={16} className="text-[#8b5cf6]" />
          </div>
          <div>
            <p className="text-[#555] text-xs">Balance disponible</p>
            <p className="text-white font-black text-xl">
              ${balance.toFixed(2)} <span className="text-[#444] text-sm font-normal">MXN</span>
            </p>
          </div>
        </div>
        {balance < 50 && (
          <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-lg">
            Insuficiente
          </span>
        )}
      </div>

      {/* Amount selector */}
      <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl p-6 mb-4">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <ArrowUpRight size={16} className="text-[#8b5cf6]" />
          ¿Cuánto quieres retirar?
        </h2>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PRESET_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => { setSelected(v); setCustom('') }}
              disabled={v > balance}
              className={`py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                selected === v && !custom
                  ? 'bg-[#8b5cf6] text-white shadow-[0_0_16px_rgba(139,92,246,0.3)]'
                  : 'bg-[#08071a] border border-[#272454] text-[#888] hover:border-[#8b5cf6]/50 hover:text-white'
              }`}
            >
              ${v}
            </button>
          ))}
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888] font-bold">$</span>
          <input
            type="number"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSelected(null) }}
            placeholder="Otro monto"
            min={50}
            max={balance}
            className="w-full bg-[#08071a] border border-[#272454] focus:border-[#8b5cf6] rounded-xl px-8 py-3 text-white font-bold text-sm outline-none transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] text-xs">MXN</span>
        </div>
      </div>

      {/* MP account input */}
      <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl p-6 mb-4">
        <h2 className="text-white font-bold mb-4 flex items-center gap-2">
          <Mail size={16} className="text-[#8b5cf6]" />
          Cuenta MercadoPago destino
        </h2>
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="email@ejemplo.com"
          className="w-full bg-[#08071a] border border-[#272454] focus:border-[#8b5cf6] rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors"
        />
        <p className="text-[#444] text-xs mt-2">
          El email registrado en la cuenta MercadoPago donde recibirás el dinero
        </p>
      </div>

      {/* Summary */}
      {amount && amount >= 50 && amount <= balance && (
        <div className="bg-[#0f0e2a] border border-[#272454] rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#888]">Monto a retirar</span>
            <span className="text-white font-bold">${amount.toFixed(2)} MXN</span>
          </div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-[#888]">Comisión</span>
            <span className="text-green-400 text-xs font-semibold">Sin cargo</span>
          </div>
          <div className="border-t border-[#1e1b4b] pt-3 flex justify-between">
            <span className="text-white font-bold">Recibirás en MP</span>
            <span className="text-[#8b5cf6] font-black">${amount.toFixed(2)} MXN</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleWithdraw}
        disabled={loading || !amount || amount < 50 || amount > balance || !recipient}
        className="w-full flex items-center justify-center gap-3 bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-colors shadow-[0_0_24px_rgba(139,92,246,0.2)] text-base"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
        {loading ? 'Procesando...' : `Retirar $${amount ?? 0} MXN`}
      </button>

      <p className="text-center text-[#333] text-xs mt-4">
        Las transferencias se acreditan de forma inmediata en tu cuenta MercadoPago
      </p>
    </div>
  )
}
