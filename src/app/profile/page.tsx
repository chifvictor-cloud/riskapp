import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import PlayerFrame from '@/components/PlayerFrame'
import Link from 'next/link'
import {
  Wallet, Trophy, Target, Star, Swords, TrendingUp,
  Gamepad2, Calendar, ChevronRight, Crown,
  ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import type { Database } from '@/types/database'

type Transaction = Database['public']['Tables']['transactions']['Row']

type Profile = Database['public']['Tables']['profiles']['Row']

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [
    { data: profileRaw },
    { data: matchesRaw },
    { data: txsRaw },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single() as unknown as Promise<{ data: Profile | null }>,

    supabase
      .from('matches')
      .select(`
        id, status, winner_id, player1_id, player2_id, created_at, played_at,
        player1:profiles!matches_player1_id_fkey(username, display_name),
        player2:profiles!matches_player2_id_fkey(username, display_name),
        tournament:tournaments(title, prize_pool, game_mode)
      `)
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('transactions')
      .select('id, type, amount, status, description, recipient, created_at')
      .eq('user_id', user.id)
      .in('type', ['deposit', 'withdrawal', 'prize'])
      .order('created_at', { ascending: false })
      .limit(15) as unknown as Promise<{ data: Transaction[] | null }>,
  ])

  const profile = profileRaw as Profile | null
  if (!profile) redirect('/auth/login')

  const matches = (matchesRaw ?? []) as any[]
  const txs = (txsRaw ?? []) as Transaction[]
  const totalMatches = profile.wins + profile.losses
  const winRate = totalMatches > 0 ? Math.round((profile.wins / totalMatches) * 100) : 0
  const displayName = profile.display_name || profile.username
  const initial = displayName[0].toUpperCase()

  const memberSince = new Date(profile.created_at).toLocaleDateString('es-MX', {
    month: 'long', year: 'numeric',
  })

  const stats = [
    { label: 'Balance', value: `$${profile.balance.toFixed(2)}`, sub: 'MXN', icon: <Wallet size={16} className="text-[#8b5cf6]" />, accent: true },
    { label: 'Ganancias', value: `$${profile.total_earnings.toFixed(0)}`, sub: 'MXN totales', icon: <TrendingUp size={16} className="text-[#8b5cf6]" /> },
    { label: 'Victorias', value: profile.wins, sub: 'ganadas', icon: <Trophy size={16} className="text-[#8b5cf6]" /> },
    { label: 'Derrotas', value: profile.losses, sub: 'perdidas', icon: <Swords size={16} className="text-[#8b5cf6]" /> },
    { label: 'Win Rate', value: `${winRate}%`, sub: `${totalMatches} partidas`, icon: <Target size={16} className="text-[#8b5cf6]" /> },
    { label: 'Puntos', value: profile.points, sub: 'acumulados', icon: <Star size={16} className="text-[#8b5cf6]" /> },
  ]

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Hero card */}
        <div className="relative bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl p-6 sm:p-8 mb-6 overflow-hidden">
          {/* Glow */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-[#8b5cf6]/5 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <PlayerFrame
                tier={profile.frame_tier ?? 1}
                className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center"
              >
                <span className="text-white font-black text-4xl sm:text-5xl">{initial}</span>
              </PlayerFrame>
              {profile.is_admin && (
                <div className="absolute -top-1.5 -right-1.5 bg-[#8b5cf6] rounded-full px-1.5 py-0.5 text-white text-[9px] font-black tracking-wider">
                  ADMIN
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-none">{displayName}</h1>
                {totalMatches >= 10 && winRate >= 60 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                    <Crown size={9} /> Pro
                  </span>
                )}
              </div>
              <p className="text-[#555] text-sm mb-3">@{profile.username}</p>

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <div className="flex items-center gap-1.5 text-[#888]">
                  <span className="text-[#444] text-xs">✉</span>
                  <span>{user.email}</span>
                </div>
                {profile.fortnite_username && (
                  <div className="flex items-center gap-1.5">
                    <Gamepad2 size={13} className="text-[#8b5cf6]" />
                    <span className="text-[#8b5cf6] font-mono font-semibold text-sm">{profile.fortnite_username}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[#555]">
                  <Calendar size={13} />
                  <span className="text-xs">Miembro desde {memberSince}</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link
              href="/tournaments"
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shadow-[0_0_16px_rgba(139,92,246,0.2)]"
            >
              <Swords size={14} />
              Jugar
            </Link>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`bg-[#0f0e2a] border rounded-xl p-4 ${s.accent ? 'border-[#8b5cf6]/25' : 'border-[#1e1b4b]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#555] text-xs">{s.label}</span>
                <div className="w-6 h-6 bg-[#8b5cf6]/10 rounded-md flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <div className={`font-black text-xl leading-none ${s.accent ? 'text-[#8b5cf6]' : 'text-white'}`}>
                {s.value}
              </div>
              <div className="text-[#444] text-[10px] mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Fortnite username prompt */}
        {!profile.fortnite_username && (
          <div className="bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-2xl px-5 py-4 mb-6 flex items-center gap-3">
            <Gamepad2 size={18} className="text-[#8b5cf6] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Agrega tu nombre de Epic Games</p>
              <p className="text-[#888] text-xs mt-0.5">Lo necesitas para que tus rivales puedan encontrarte en Fortnite</p>
            </div>
            <Link
              href="/tournaments"
              className="text-[#8b5cf6] text-xs font-bold hover:underline flex-shrink-0"
            >
              Se pide al crear torneo →
            </Link>
          </div>
        )}

        {/* Match history */}
        <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1b4b]">
            <h2 className="text-white font-bold flex items-center gap-2">
              <Swords size={15} className="text-[#8b5cf6]" />
              Historial de partidas
            </h2>
            <span className="text-[#555] text-xs">{matches.length} recientes</span>
          </div>

          {matches.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-[#0f0e2a] border border-[#201e50] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Swords size={22} className="text-[#2d2960]" />
              </div>
              <p className="text-white font-bold mb-1">Sin partidas todavía</p>
              <p className="text-[#555] text-sm mb-5">Únete a tu primer torneo y empieza a competir</p>
              <Link
                href="/tournaments"
                className="inline-flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Ver torneos disponibles
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#0f0e2a]">
              {matches.map((m: any) => {
                const isPlayer1 = m.player1_id === user.id
                const opponent = isPlayer1 ? m.player2 : m.player1
                const opponentName = opponent?.display_name || opponent?.username || 'Desconocido'
                const isWinner = m.winner_id === user.id
                const isPending = m.status === 'in_progress'
                const isDisputed = m.status === 'disputed'

                const date = new Date(m.played_at || m.created_at).toLocaleDateString('es-MX', {
                  day: 'numeric', month: 'short',
                })

                return (
                  <Link
                    key={m.id}
                    href={isPending || isDisputed ? `/match/${m.id}` : `/tournaments/${m.tournament?.id ?? ''}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-[#0f0e2a] transition-colors group"
                  >
                    {/* Result dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isPending ? 'bg-[#8b5cf6] animate-pulse' :
                      isDisputed ? 'bg-yellow-400 animate-pulse' :
                      isWinner ? 'bg-green-400' : 'bg-red-400'
                    }`} />

                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate group-hover:text-[#8b5cf6] transition-colors">
                        vs {opponentName}
                      </p>
                      <p className="text-[#555] text-xs mt-0.5 truncate">
                        {m.tournament?.game_mode && `${m.tournament.game_mode} · `}{m.tournament?.title}
                      </p>
                    </div>

                    {/* Prize + result */}
                    <div className="text-right flex-shrink-0">
                      {isPending ? (
                        <span className="text-[#8b5cf6] text-xs font-bold">En curso</span>
                      ) : isDisputed ? (
                        <span className="text-yellow-400 text-xs font-bold">En disputa</span>
                      ) : m.winner_id ? (
                        <>
                          <p className={`text-sm font-bold ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                            {isWinner ? 'Victoria' : 'Derrota'}
                          </p>
                          {isWinner && m.tournament?.prize_pool && (
                            <p className="text-[#8b5cf6] text-xs font-mono">+${m.tournament.prize_pool}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-[#555] text-xs">Sin resultado</span>
                      )}
                      <p className="text-[#3a375e] text-[10px] mt-0.5">{date}</p>
                    </div>

                    <ChevronRight size={14} className="text-[#2d2960] group-hover:text-[#555] transition-colors flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Transaction history */}
        <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl overflow-hidden mt-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1b4b]">
            <h2 className="text-white font-bold flex items-center gap-2">
              <Wallet size={15} className="text-[#8b5cf6]" />
              Movimientos
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href="/withdraw"
                className="inline-flex items-center gap-1 text-[#8b5cf6] hover:text-white bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/20 border border-[#8b5cf6]/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                <ArrowUpRight size={12} />
                Retirar
              </Link>
              <Link
                href="/deposit"
                className="inline-flex items-center gap-1 text-[#009ee3] hover:text-white bg-[#009ee3]/10 hover:bg-[#009ee3]/20 border border-[#009ee3]/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                <ArrowDownLeft size={12} />
                Depositar
              </Link>
            </div>
          </div>

          {txs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-[#0f0e2a] border border-[#201e50] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Wallet size={18} className="text-[#2d2960]" />
              </div>
              <p className="text-white font-bold text-sm mb-1">Sin movimientos</p>
              <p className="text-[#555] text-xs">Tus depósitos y retiros aparecerán aquí</p>
            </div>
          ) : (
            <div className="divide-y divide-[#0a091f]">
              {txs.map((tx) => {
                const isDeposit = tx.type === 'deposit' || tx.type === 'prize'
                const isWithdrawal = tx.type === 'withdrawal'
                const isPending = tx.status === 'pending'
                const isFailed = tx.status === 'failed'

                const date = new Date(tx.created_at).toLocaleDateString('es-MX', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })

                const typeLabel =
                  tx.type === 'deposit' ? 'Depósito' :
                  tx.type === 'withdrawal' ? 'Retiro' :
                  tx.type === 'prize' ? 'Premio' : tx.type

                return (
                  <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isWithdrawal
                        ? 'bg-[#8b5cf6]/10'
                        : 'bg-green-500/10'
                    }`}>
                      {isWithdrawal
                        ? <ArrowUpRight size={14} className="text-[#8b5cf6]" />
                        : <ArrowDownLeft size={14} className="text-green-400" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{typeLabel}</p>
                      <p className="text-[#555] text-xs mt-0.5 truncate">
                        {isWithdrawal && tx.recipient
                          ? `→ ${tx.recipient}`
                          : tx.description ?? date
                        }
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${
                        isFailed ? 'text-[#555] line-through' :
                        isWithdrawal ? 'text-[#8b5cf6]' : 'text-green-400'
                      }`}>
                        {isWithdrawal ? '-' : '+'}{tx.amount.toFixed(2)} MXN
                      </p>
                      <p className={`text-[10px] mt-0.5 ${
                        isFailed ? 'text-red-400' :
                        isPending ? 'text-yellow-400' :
                        'text-[#3a375e]'
                      }`}>
                        {isFailed ? (isWithdrawal ? 'Rechazado' : 'Fallido') : isPending ? 'Pendiente' : date}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
