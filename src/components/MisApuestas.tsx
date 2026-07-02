'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Coins, TrendingUp } from 'lucide-react'

interface MyBet {
  bet_id: string
  match_id: string
  bet_on: string
  amount: number
  payout: number
  bet_status: 'abierta' | 'ganada' | 'perdida' | 'cancelada'
  match_status: string
  winner_id: string | null
  opponent_label: string
  created_at: string
}

const STATUS_CONFIG = {
  abierta:   { label: 'En juego',  color: 'text-[#e85d24]',   bg: 'bg-[#e85d24]/10',  border: 'border-[#e85d24]/20'  },
  ganada:    { label: 'Ganada',    color: 'text-yellow-400',  bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  perdida:   { label: 'Perdida',   color: 'text-red-400',     bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  cancelada: { label: 'Cancelada', color: 'text-[#555]',      bg: 'bg-[#0a0a0a]',    border: 'border-[#222]'        },
}

const STATUS_ORDER: Array<MyBet['bet_status']> = ['abierta', 'ganada', 'perdida', 'cancelada']

export default function MisApuestas() {
  const supabase = createClient()
  const [bets, setBets] = useState<MyBet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error: rpcError } = await (supabase as any).rpc('get_my_bets')
      if (rpcError) {
        setError('No se pudieron cargar tus apuestas')
      } else {
        setBets(data ?? [])
      }
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="bg-[#111] border border-[#e85d24]/20 rounded-2xl p-5 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-[#e85d24]/40 border-t-[#e85d24] rounded-full animate-spin flex-shrink-0" />
        <span className="text-[#555] text-sm">Cargando apuestas...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#111] border border-red-500/20 rounded-2xl p-5">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (bets.length === 0) {
    return (
      <div className="bg-[#111] border border-[#e85d24]/20 rounded-2xl p-5 text-center">
        <Coins size={28} className="text-[#333] mx-auto mb-2" />
        <p className="text-[#555] text-sm">Aún no tienes apuestas registradas</p>
      </div>
    )
  }

  const totalApostado = bets.reduce((sum, b) => sum + b.amount, 0)
  const totalGanado = bets.filter(b => b.bet_status === 'ganada').reduce((sum, b) => sum + b.payout, 0)

  const grouped = Object.fromEntries(
    STATUS_ORDER.map(s => [s, bets.filter(b => b.bet_status === s)])
  ) as Record<MyBet['bet_status'], MyBet[]>

  return (
    <div className="bg-[#111] border border-[#e85d24]/20 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-[#e85d24]/10 rounded-lg flex items-center justify-center">
          <TrendingUp size={14} className="text-[#e85d24]" />
        </div>
        <span className="text-white font-bold text-sm">Mis apuestas</span>
        <span className="ml-auto text-[#555] text-xs">{bets.length} total</span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3">
          <p className="text-[#555] text-xs mb-0.5">Total apostado</p>
          <p className="text-white font-black text-lg leading-tight">
            {totalApostado} <span className="text-[#555] font-normal text-xs">pts</span>
          </p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3">
          <p className="text-[#555] text-xs mb-0.5">Total ganado</p>
          <p className="text-yellow-400 font-black text-lg leading-tight">
            {totalGanado} <span className="text-[#555] font-normal text-xs">pts</span>
          </p>
        </div>
      </div>

      {/* Apuestas agrupadas por estado */}
      {STATUS_ORDER.map(status => {
        const group = grouped[status]
        if (group.length === 0) return null
        const cfg = STATUS_CONFIG[status]
        return (
          <div key={status}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${cfg.color}`}>
              {cfg.label} · {group.length}
            </p>
            <div className="space-y-2">
              {group.map(bet => (
                <div
                  key={bet.bet_id}
                  className={`${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3 flex items-center justify-between gap-3`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-bold truncate">vs {bet.opponent_label}</p>
                    <p className="text-[#555] text-[10px] mt-0.5">
                      {new Date(bet.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[#888] text-xs">−{bet.amount} pts</p>
                    {bet.bet_status === 'ganada' && bet.payout > 0 && (
                      <p className="text-yellow-400 text-xs font-bold">+{bet.payout} pts</p>
                    )}
                    {bet.bet_status === 'abierta' && (
                      <p className={`text-[10px] font-bold ${cfg.color}`}>En juego</p>
                    )}
                    {bet.bet_status === 'perdida' && (
                      <p className="text-red-400 text-[10px] font-bold">Perdida</p>
                    )}
                    {bet.bet_status === 'cancelada' && (
                      <p className="text-[#555] text-[10px]">Cancelada</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
