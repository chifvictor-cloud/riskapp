import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/server'
import PlayerFrame from '@/components/PlayerFrame'
import { Trophy, Crown, Star, Target } from 'lucide-react'

export const revalidate = 60

export default async function RankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: playersRaw } = await supabase
    .from('profiles')
    .select('id, username, display_name, wins, losses, points, total_earnings, is_vip, frame_tier')
    .order('wins', { ascending: false })
    .limit(50)

  const players = (playersRaw ?? []) as {
    id: string
    username: string
    display_name: string | null
    wins: number
    losses: number
    points: number
    total_earnings: number
    is_vip: boolean
    frame_tier: number
  }[]

  const myRank = user ? players.findIndex(p => p.id === user.id) + 1 : 0
  const myProfile = user ? players.find(p => p.id === user.id) : null

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-[#8b5cf6]/10 rounded-xl flex items-center justify-center">
            <Trophy size={20} className="text-[#8b5cf6]" />
          </div>
          <div>
            <p className="text-[#8b5cf6] text-xs font-bold uppercase tracking-widest mb-0.5">Top jugadores</p>
            <h1 className="text-3xl font-black text-white leading-none">Ranking Global</h1>
          </div>
        </div>

        {/* Top 3 podium */}
        {players.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[players[1], players[0], players[2]].map((player, idx) => {
              const actualRank = idx === 1 ? 1 : idx === 0 ? 2 : 3
              const colors = ['#9ca3af', '#facc15', '#d97706']
              const heights = ['h-28', 'h-36', 'h-24']
              const color = colors[actualRank - 1]
              const totalMatches = player.wins + player.losses
              const winRate = totalMatches > 0 ? Math.round((player.wins / totalMatches) * 100) : 0

              return (
                <div key={player.id} className={`flex flex-col items-center ${idx === 1 ? 'order-2' : idx === 0 ? 'order-1' : 'order-3'}`}>
                  <div className="flex flex-col items-center mb-2">
                    {actualRank === 1 && <Crown size={20} className="text-yellow-400 mb-1" />}
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl border-2"
                      style={{ background: `${color}20`, borderColor: color }}
                    >
                      {(player.display_name || player.username)[0]?.toUpperCase()}
                    </div>
                    <p className="text-white font-bold text-sm mt-2 text-center truncate max-w-[90px]">
                      {player.display_name || player.username}
                    </p>
                    <p className="text-[#555] text-xs">{player.wins}V · {winRate}%</p>
                  </div>
                  <div
                    className={`w-full ${heights[actualRank - 1]} rounded-t-xl flex items-start justify-center pt-2`}
                    style={{ background: `${color}15`, border: `1px solid ${color}30`, borderBottom: 'none' }}
                  >
                    <span className="font-black text-lg" style={{ color }}>#{actualRank}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* My position card (if logged in and not in top 3) */}
        {user && myProfile && myRank > 3 && (
          <div className="mb-5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl px-5 py-4 flex items-center gap-4">
            <span className="text-[#8b5cf6] font-black text-2xl">#{myRank}</span>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Tu posición en el ranking</p>
              <p className="text-[#888] text-xs">
                {myProfile.wins} victorias · {myProfile.losses} derrotas · {myProfile.points.toLocaleString()} pts
              </p>
            </div>
            <Target size={18} className="text-[#8b5cf6] flex-shrink-0" />
          </div>
        )}

        {/* Stats summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Jugadores', value: players.length, icon: <Star size={14} className="text-[#8b5cf6]" /> },
            { label: 'Mejor WR', value: (() => {
              const best = players.find(p => p.wins + p.losses >= 5)
              if (!best) return '—'
              const t = best.wins + best.losses
              return `${Math.round(best.wins / t * 100)}%`
            })(), icon: <Trophy size={14} className="text-yellow-400" /> },
            { label: 'Total victorias', value: players.reduce((a, p) => a + p.wins, 0), icon: <Crown size={14} className="text-[#3b82f6]" /> },
          ].map((s, i) => (
            <div key={i} className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-[#08071a] rounded-lg flex items-center justify-center flex-shrink-0">
                {s.icon}
              </div>
              <div>
                <p className="text-white font-black text-lg leading-none">{s.value}</p>
                <p className="text-[#555] text-xs">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Full leaderboard table */}
        <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-[#1e1b4b]">
            <div className="col-span-1 text-[#555] text-xs font-semibold uppercase tracking-wider">#</div>
            <div className="col-span-5 text-[#555] text-xs font-semibold uppercase tracking-wider">Jugador</div>
            <div className="col-span-2 text-center text-[#555] text-xs font-semibold uppercase tracking-wider">V</div>
            <div className="col-span-2 text-center text-[#555] text-xs font-semibold uppercase tracking-wider">WR</div>
            <div className="col-span-2 text-center text-[#555] text-xs font-semibold uppercase tracking-wider">Pts</div>
          </div>

          {players.length === 0 ? (
            <div className="text-center py-16 text-[#555]">
              <Trophy size={32} className="mx-auto mb-3 opacity-30" />
              <p>Aún no hay jugadores en el ranking</p>
            </div>
          ) : (
            players.map((player, i) => {
              const rank = i + 1
              const totalMatches = player.wins + player.losses
              const winRate = totalMatches > 0 ? Math.round((player.wins / totalMatches) * 100) : 0
              const isMe = player.id === user?.id
              const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
              const avatarBg = rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : 'bg-amber-600'

              return (
                <div
                  key={player.id}
                  className={`grid grid-cols-12 gap-2 px-5 py-3.5 border-b border-[#08071a] items-center transition-colors ${
                    isMe
                      ? 'bg-[#8b5cf6]/8'
                      : rank <= 3
                      ? 'bg-[#0d0c24]'
                      : 'hover:bg-[#0d0c24]'
                  }`}
                >
                  {/* Rank */}
                  <div className="col-span-1">
                    {medalEmoji ? (
                      <span className="text-base leading-none">{medalEmoji}</span>
                    ) : (
                      <span className={`text-sm font-bold ${isMe ? 'text-[#8b5cf6]' : rank <= 10 ? 'text-[#888]' : 'text-[#444]'}`}>
                        {rank}
                      </span>
                    )}
                  </div>

                  {/* Player */}
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                    {rank <= 3 ? (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${avatarBg}`}>
                        {(player.display_name || player.username)[0]?.toUpperCase()}
                      </div>
                    ) : (
                      <PlayerFrame
                        tier={player.frame_tier ?? 1}
                        className="w-8 h-8 flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                      >
                        {(player.display_name || player.username)[0]?.toUpperCase()}
                      </PlayerFrame>
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${isMe ? 'text-[#8b5cf6]' : 'text-white'}`}>
                        {player.display_name || player.username}
                        {player.is_vip && <Crown size={10} className="inline ml-1 text-yellow-400" />}
                      </p>
                      <p className="text-[#444] text-[10px] truncate">@{player.username}</p>
                    </div>
                  </div>

                  {/* Wins */}
                  <div className="col-span-2 text-center">
                    <span className="text-white font-bold text-sm">{player.wins}</span>
                  </div>

                  {/* Win rate */}
                  <div className="col-span-2 text-center">
                    <span className={`font-bold text-sm ${winRate >= 60 ? 'text-green-400' : winRate >= 40 ? 'text-[#8b5cf6]' : 'text-[#888]'}`}>
                      {totalMatches > 0 ? `${winRate}%` : '—'}
                    </span>
                  </div>

                  {/* Points */}
                  <div className="col-span-2 text-center">
                    <span className="text-white font-semibold text-sm">{player.points.toLocaleString()}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <p className="text-[#333] text-xs text-center mt-4">Se actualiza cada 60 segundos · Top 50 jugadores</p>
      </main>
    </div>
  )
}
