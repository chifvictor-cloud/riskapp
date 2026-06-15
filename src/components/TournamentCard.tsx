import Link from 'next/link'
import { Users, DollarSign, Swords } from 'lucide-react'
import type { Database } from '@/types/database'

type Tournament = Database['public']['Tables']['tournaments']['Row']

const statusConfig = {
  open: { label: 'Abierto', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', dot: 'bg-green-400' },
  in_progress: { label: 'En curso', color: 'text-[#e85d24]', bg: 'bg-[#e85d24]/10 border-[#e85d24]/20', dot: 'bg-[#e85d24]' },
  completed: { label: 'Completado', color: 'text-[#888]', bg: 'bg-[#888]/10 border-[#888]/20', dot: 'bg-[#888]' },
  cancelled: { label: 'Cancelado', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', dot: 'bg-red-400' },
}

const formatIcon: Record<string, string> = {
  'No Build': '🚫🔨',
  'Construcción': '🏗️',
  'Zero Build': '⚡',
}

export default function TournamentCard({ tournament }: { tournament: Tournament }) {
  const status = statusConfig[tournament.status]
  const spotsLeft = tournament.max_players - tournament.current_players
  const isFull = spotsLeft === 0

  return (
    <Link href={`/tournaments/${tournament.id}`}>
      <div className="bg-[#111] border border-[#222] rounded-xl p-5 hover:border-[#e85d24]/50 hover:shadow-[0_0_24px_rgba(232,93,36,0.12)] transition-all duration-200 group cursor-pointer h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${status.bg} ${status.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${tournament.status === 'open' ? 'animate-pulse' : ''}`} />
                {status.label}
              </span>
            </div>
            <h3 className="text-white font-bold text-base group-hover:text-[#e85d24] transition-colors line-clamp-2 leading-tight">
              {tournament.title}
            </h3>
          </div>
          {/* Prize */}
          <div className="ml-3 text-right flex-shrink-0">
            <div className="text-[#e85d24] font-black text-xl leading-none">${tournament.prize_pool}</div>
            <div className="text-[#555] text-xs mt-0.5">MXN premio</div>
          </div>
        </div>

        {/* Format badge */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] px-2.5 py-1 rounded-lg font-medium">
            {formatIcon[tournament.game_mode] ?? '🎮'} {tournament.game_mode}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5">
            <DollarSign size={13} className="text-[#555]" />
            <span className="text-white text-sm font-bold">${tournament.entry_fee}</span>
            <span className="text-[#555] text-xs">entrada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Swords size={13} className="text-[#555]" />
            <span className="text-white text-sm font-bold">1v1</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-[#555]" />
            <span className={`text-sm font-bold ${isFull ? 'text-red-400' : 'text-white'}`}>
              {tournament.current_players}/{tournament.max_players}
            </span>
          </div>
        </div>

        {/* Progress bar for open tournaments */}
        {tournament.status === 'open' && (
          <div className="mt-4">
            <div className="h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e85d24] rounded-full transition-all duration-500"
                style={{ width: `${(tournament.current_players / tournament.max_players) * 100}%` }}
              />
            </div>
            <p className="text-[#555] text-xs mt-1.5">
              {isFull ? 'Torneo lleno' : `${spotsLeft} cupo${spotsLeft !== 1 ? 's' : ''} disponible`}
            </p>
          </div>
        )}
      </div>
    </Link>
  )
}
