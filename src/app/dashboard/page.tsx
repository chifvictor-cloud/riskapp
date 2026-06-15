import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { Trophy, Wallet, TrendingUp, Plus, ChevronRight, Target, Swords, Star } from 'lucide-react'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: profile },
    { data: recentMatches },
    { data: activeTournaments },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single() as unknown as Promise<{ data: Profile | null }>,

    supabase
      .from('matches')
      .select(`
        id, status, winner_id, created_at, played_at,
        player1:profiles!matches_player1_id_fkey(username, display_name),
        player2:profiles!matches_player2_id_fkey(username, display_name),
        tournament:tournaments(title, prize_pool, game_mode)
      `)
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(6),

    supabase
      .from('tournament_participants')
      .select(`
        tournament_id, status, joined_at,
        tournaments(id, title, prize_pool, entry_fee, status, game_mode, current_players, max_players)
      `)
      .eq('player_id', user.id)
      .in('status', ['registered', 'playing'])
      .order('joined_at', { ascending: false })
      .limit(4),
  ])

  const totalMatches = (profile?.wins ?? 0) + (profile?.losses ?? 0)
  const winRate = totalMatches > 0
    ? Math.round(((profile?.wins ?? 0) / totalMatches) * 100)
    : 0

  const stats = [
    {
      label: 'Balance',
      value: `$${(profile?.balance ?? 0).toFixed(2)}`,
      sub: 'MXN disponible',
      icon: <Wallet size={18} className="text-[#7c3aed]" />,
      accent: true,
      link: '/wallet',
      linkLabel: 'Depositar',
    },
    {
      label: 'Ganancias totales',
      value: `$${(profile?.total_earnings ?? 0).toFixed(2)}`,
      sub: 'MXN ganados',
      icon: <TrendingUp size={18} className="text-[#7c3aed]" />,
    },
    {
      label: 'Victorias',
      value: profile?.wins ?? 0,
      sub: `${profile?.losses ?? 0} derrotas · ${totalMatches} total`,
      icon: <Trophy size={18} className="text-[#7c3aed]" />,
    },
    {
      label: 'Win Rate',
      value: `${winRate}%`,
      sub: `${totalMatches} partidas jugadas`,
      icon: <Target size={18} className="text-[#7c3aed]" />,
    },
    {
      label: 'Puntos',
      value: profile?.points ?? 0,
      sub: 'pts acumulados',
      icon: <Star size={18} className="text-[#7c3aed]" />,
    },
    {
      label: 'Racha',
      value: `${profile?.wins ?? 0}W`,
      sub: `${profile?.losses ?? 0}L en total`,
      icon: <Swords size={18} className="text-[#7c3aed]" />,
    },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <p className="text-[#7c3aed] text-sm font-semibold uppercase tracking-widest mb-1">Mi panel</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-none">
              Hola, <span style={{ color: '#7c3aed' }}>{profile?.display_name || profile?.username}</span>
            </h1>
            <p className="text-[#888] text-sm mt-1.5">@{profile?.username}</p>
          </div>
          <Link
            href="/tournaments?create=1"
            className="inline-flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold px-5 py-3 rounded-xl transition-colors shadow-[0_0_20px_rgba(124,58,237,0.2)]"
          >
            <Plus size={18} />
            Crear torneo
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {stats.map((s, i) => (
            <div key={i} className={`bg-[#111] border rounded-xl p-4 ${s.accent ? 'border-[#7c3aed]/30' : 'border-[#1e1e1e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#555] text-xs">{s.label}</span>
                <div className="w-7 h-7 bg-[#7c3aed]/10 rounded-lg flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <div className={`font-black text-xl ${s.accent ? 'text-[#7c3aed]' : 'text-white'}`}>{s.value}</div>
              <div className="text-[#444] text-xs mt-0.5">{s.sub}</div>
              {s.link && (
                <Link href={s.link} className="inline-block mt-2 text-[#7c3aed] text-xs font-semibold hover:underline">
                  {s.linkLabel} →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Recent matches — main column */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-white font-bold text-base flex items-center gap-2">
                  <Swords size={16} className="text-[#7c3aed]" />
                  Partidas recientes
                </h2>
                <Link href="/tournaments" className="text-[#7c3aed] text-xs flex items-center gap-1 hover:underline">
                  Ver torneos <ChevronRight size={12} />
                </Link>
              </div>

              {recentMatches && recentMatches.length > 0 ? (
                <div className="space-y-2">
                  {recentMatches.map((m: any) => {
                    const isWinner = m.winner_id === user.id
                    const isPending = m.status === 'in_progress'
                    const opponent = m.player1_id === user.id
                      ? m.player2
                      : m.player1

                    return (
                      <div key={m.id} className="flex items-center gap-3 bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isPending ? 'bg-[#7c3aed] animate-pulse' :
                          isWinner ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            vs {opponent?.display_name || opponent?.username || 'Desconocido'}
                          </p>
                          <p className="text-[#555] text-xs">{m.tournament?.game_mode} · {m.tournament?.title}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {isPending ? (
                            <span className="text-[#7c3aed] text-xs font-semibold">En curso</span>
                          ) : m.winner_id ? (
                            <>
                              <span className={`text-xs font-bold ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                                {isWinner ? 'Victoria' : 'Derrota'}
                              </span>
                              {isWinner && (
                                <p className="text-[#7c3aed] text-xs">+${m.tournament?.prize_pool} MXN</p>
                              )}
                            </>
                          ) : (
                            <span className="text-[#555] text-xs">Sin resultado</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Swords size={36} className="text-[#2a2a2a] mx-auto mb-3" />
                  <p className="text-[#888] text-sm">Aún no has jugado ninguna partida</p>
                  <Link
                    href="/tournaments"
                    className="inline-block mt-4 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                  >
                    Buscar torneo
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active tournaments */}
            <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5">
              <h2 className="text-white font-bold text-base flex items-center gap-2 mb-4">
                <Trophy size={16} className="text-[#7c3aed]" />
                Torneos activos
              </h2>

              {activeTournaments && activeTournaments.length > 0 ? (
                <div className="space-y-2">
                  {activeTournaments.map((entry: any) => {
                    const t = entry.tournaments
                    if (!t) return null
                    return (
                      <Link
                        key={entry.tournament_id}
                        href={`/tournaments/${t.id}`}
                        className="flex items-center justify-between bg-[#111] border border-[#1a1a1a] hover:border-[#7c3aed]/30 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate group-hover:text-[#7c3aed] transition-colors">
                            {t.title}
                          </p>
                          <p className="text-[#555] text-xs">{t.game_mode}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className={`w-2 h-2 rounded-full ${t.status === 'open' ? 'bg-green-400 animate-pulse' : 'bg-[#7c3aed]'}`} />
                          <ChevronRight size={14} className="text-[#444]" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Trophy size={28} className="text-[#2a2a2a] mx-auto mb-2" />
                  <p className="text-[#888] text-xs">Sin torneos activos</p>
                  <Link
                    href="/tournaments"
                    className="inline-block mt-3 text-[#7c3aed] text-xs hover:underline font-semibold"
                  >
                    Ver disponibles
                  </Link>
                </div>
              )}
            </div>

            {/* Profile card */}
            <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5">
              <h2 className="text-white font-bold text-base mb-4">Perfil</h2>
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#1a1a1a]">
                <div className="w-12 h-12 rounded-full bg-[#7c3aed] flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                  {(profile?.display_name || profile?.username || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white font-bold truncate">{profile?.display_name}</p>
                  <p className="text-[#555] text-xs">@{profile?.username}</p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#555]">Fortnite</span>
                  <span className="text-white font-medium">
                    {profile?.fortnite_username
                      ? profile.fortnite_username
                      : <Link href="/profile" className="text-[#7c3aed] hover:underline text-xs">Agregar usuario</Link>
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#555]">Puntos</span>
                  <span className="text-white font-bold">{profile?.points ?? 0} pts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#555]">Win Rate</span>
                  <span className="text-[#7c3aed] font-bold">{winRate}%</span>
                </div>
              </div>

              <Link
                href="/profile"
                className="mt-4 w-full block text-center text-sm bg-[#111] hover:bg-[#1a1a1a] border border-[#222] text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                Editar perfil
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
