'use client'

import { useState, useTransition } from 'react'
import PlayerFrame from '@/components/PlayerFrame'
import { buyFrameTier } from './actions'
import { formatPts } from '@/lib/format'
import { Trophy, Star, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface FrameTierRow {
  tier: number
  name: string
  wins_required: number
  purchase_price: number | null
}

interface Props {
  initialUserTier: number
  initialPoints: number
  tiers: FrameTierRow[]
}

export default function FrameShop({ initialUserTier, initialPoints, tiers }: Props) {
  const [userTier, setUserTier] = useState(initialUserTier)
  const [points, setPoints] = useState(initialPoints)
  const [confirmingTier, setConfirmingTier] = useState<number | null>(null)
  const [pendingTier, setPendingTier] = useState<number | null>(null)
  const [successTier, setSuccessTier] = useState<number | null>(null)
  const [errorTier, setErrorTier] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [, startTransition] = useTransition()

  const handleBuy = (t: FrameTierRow) => {
    if (t.purchase_price === null) return
    setConfirmingTier(null)
    setErrorTier(null)
    setPendingTier(t.tier)
    startTransition(async () => {
      const result = await buyFrameTier(t.tier)
      if ('error' in result) {
        setErrorTier(t.tier)
        setErrorMsg(result.error ?? 'Error')
      } else {
        setUserTier(result.newTier)
        setPoints(p => p - result.pointsSpent)
        setSuccessTier(result.newTier)
        setTimeout(() => setSuccessTier(null), 4000)
      }
      setPendingTier(null)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-white font-bold flex items-center gap-2 text-sm">
          <Trophy size={14} className="text-[#8b5cf6]" />
          Marcos de jugador
        </h2>
        <div className="flex items-center gap-1.5 bg-[#0f0e2a] border border-[#1e1b4b] rounded-full px-3 py-1.5">
          <Star size={12} className="text-[#8b5cf6]" />
          <span className="text-white font-black text-sm">{formatPts(points)}</span>
          <span className="text-[#888] text-xs">pts</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {tiers.map(t => {
          const owned = t.tier <= userTier
          const purchasable = t.purchase_price !== null
          const canAfford = purchasable && points >= (t.purchase_price as number)
          const isConfirming = confirmingTier === t.tier
          const isPending = pendingTier === t.tier
          const isSuccess = successTier === t.tier
          const isError = errorTier === t.tier

          return (
            <div
              key={t.tier}
              className={`bg-[#0f0e2a] border rounded-2xl p-4 flex flex-col items-center text-center transition-all ${
                isSuccess ? 'border-green-400/40' : owned ? 'border-[#8b5cf6]/30' : 'border-[#1e1b4b]'
              }`}
            >
              <PlayerFrame
                tier={t.tier}
                className="w-16 h-16 flex items-center justify-center text-white font-black text-xl mb-3"
              >
                {t.name[0]}
              </PlayerFrame>
              <h3 className="text-white font-bold text-sm mb-0.5">{t.name}</h3>
              <p className="text-[#555] text-xs mb-3">
                {t.wins_required === 0 ? 'Marco inicial' : `${t.wins_required} victorias`}
              </p>

              <div className="w-full mt-auto">
                {isError && (
                  <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 py-1.5 px-2 rounded-lg text-[11px] mb-2 text-left">
                    <AlertCircle size={11} className="flex-shrink-0" />
                    {errorMsg}
                  </div>
                )}

                {owned ? (
                  <div className="flex items-center justify-center gap-1.5 text-green-400 text-xs font-bold py-2">
                    <CheckCircle size={12} />
                    {t.tier === userTier ? 'Tuyo' : 'Desbloqueado'}
                  </div>
                ) : !purchasable ? (
                  <p className="text-[#555] text-[11px] py-2">
                    Se desbloquea con {t.wins_required} victorias
                  </p>
                ) : isPending ? (
                  <div className="flex items-center justify-center gap-1.5 text-[#8b5cf6] text-xs font-bold py-2">
                    <Clock size={12} className="animate-spin" />
                    Procesando...
                  </div>
                ) : isConfirming ? (
                  <div>
                    <p className="text-[11px] text-[#888] mb-2">
                      Pagas <span className="text-white font-bold">{formatPts(t.purchase_price!)} pts</span>
                      <br />
                      Te quedan <span className="text-white font-bold">{formatPts(points - t.purchase_price!)} pts</span>
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleBuy(t)}
                        className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white py-2 rounded-lg text-xs font-bold transition-all"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmingTier(null)}
                        className="flex-1 bg-[#08071a] border border-[#272454] text-[#888] py-2 rounded-lg text-xs font-bold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : canAfford ? (
                  <button
                    onClick={() => { setErrorTier(null); setConfirmingTier(t.tier) }}
                    disabled={pendingTier !== null}
                    className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white py-2 rounded-lg text-xs font-bold transition-all shadow-[0_0_16px_rgba(139,92,246,0.2)] disabled:opacity-50"
                  >
                    Comprar · {formatPts(t.purchase_price!)} pts
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full bg-[#08071a] border border-[#272454] text-[#444] py-2 rounded-lg text-xs font-bold cursor-not-allowed"
                  >
                    Te faltan {formatPts((t.purchase_price as number) - points)} pts
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
