'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveDispute } from './actions'
import {
  ShieldAlert, Trophy, ImageIcon, Check, AlertCircle, X, Clock,
  Swords, Users, TrendingUp, LayoutDashboard, Wifi, Crown,
  ChevronRight, BadgeCheck,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  tournamentsToday: number
  revenueToday: number
  disputesCount: number
  totalUsers: number
}

interface PlayerInfo { id: string; username: string; display_name: string | null }
interface DisputedMatch {
  id: string
  tournament_id: string
  player1_id: string
  player2_id: string
  player1_screenshot_url: string | null
  player2_screenshot_url: string | null
  player1_claimed_winner: string | null
  player2_claimed_winner: string | null
  player1_epic: string | null
  player2_epic: string | null
  created_at: string
  tournament: { title: string; prize_pool: number; game_mode: string } | null
  player1: PlayerInfo | null
  player2: PlayerInfo | null
}
interface ActiveMatch {
  id: string
  tournament_id: string
  player1_id: string
  player2_id: string
  created_at: string
  player1_claimed_winner: string | null
  player2_claimed_winner: string | null
  tournament: { title: string; prize_pool: number; game_mode: string } | null
  player1: PlayerInfo | null
  player2: PlayerInfo | null
}
interface User {
  id: string
  username: string
  display_name: string | null
  balance: number
  wins: number
  losses: number
  is_admin: boolean
  created_at: string
}

interface Props {
  stats: Stats
  initialDisputes: DisputedMatch[]
  initialActiveMatches: ActiveMatch[]
  users: User[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsed(createdAt: string) {
  const s = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── Dispute Card ──────────────────────────────────────────────────────────────

function DisputeCard({ match, onResolved }: { match: DisputedMatch; onResolved: (id: string) => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [expandScreenshot, setExpandScreenshot] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const p1Name = match.player1?.display_name || match.player1?.username || 'J1'
  const p2Name = match.player2?.display_name || match.player2?.username || 'J2'

  const resolve = (winnerId: string) => {
    setError(null)
    startTransition(async () => {
      const result = await resolveDispute(match.id, winnerId, note)
      if ('error' in result) {
        setError(result.error ?? 'Error desconocido')
      } else {
        setResolved(true)
        setTimeout(() => onResolved(match.id), 1200)
      }
    })
  }

  if (resolved) {
    return (
      <div className="bg-green-500/8 border border-green-500/20 rounded-2xl p-5 flex items-center justify-center gap-3 h-24">
        <Check size={20} className="text-green-400" />
        <p className="text-green-400 font-bold">Disputa resuelta — premio pagado</p>
      </div>
    )
  }

  return (
    <>
      {/* Lightbox */}
      {expandScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpandScreenshot(null)}
        >
          <img src={expandScreenshot} alt="Evidencia" className="max-w-3xl max-h-[85vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-[#0e0e0e] border border-yellow-400/25 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1a1a1a] bg-yellow-400/3">
          <ShieldAlert size={15} className="text-yellow-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{match.tournament?.title}</p>
            <p className="text-[#555] text-xs">
              {match.tournament?.game_mode} · ${match.tournament?.prize_pool} MXN · hace {elapsed(match.created_at)}
            </p>
          </div>
          <span className="text-yellow-400 text-[10px] font-black px-2 py-0.5 bg-yellow-400/10 border border-yellow-400/20 rounded-full tracking-wider">DISPUTA</span>
        </div>

        <div className="p-5 space-y-5">
          {/* Players */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                player: match.player1, epic: match.player1_epic,
                claimed: match.player1_claimed_winner, id: match.player1_id,
                name: p1Name, screenshotUrl: match.player1_screenshot_url,
              },
              {
                player: match.player2, epic: match.player2_epic,
                claimed: match.player2_claimed_winner, id: match.player2_id,
                name: p2Name, screenshotUrl: match.player2_screenshot_url,
              },
            ].map(({ name, epic, claimed, id, screenshotUrl }) => (
              <div key={id} className="space-y-2">
                {/* Player info */}
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-bold text-sm truncate">{name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      claimed === id
                        ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                        : 'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>
                      {claimed === id ? '✓ Dice ganó' : '✗ Dice perdió'}
                    </span>
                  </div>
                  {epic && (
                    <p className="text-[#7c3aed] text-xs font-mono">{epic}</p>
                  )}
                </div>
                {/* Screenshot */}
                {screenshotUrl ? (
                  <button
                    onClick={() => setExpandScreenshot(screenshotUrl)}
                    className="w-full block"
                  >
                    <img
                      src={screenshotUrl}
                      alt="Evidencia"
                      className="w-full rounded-xl border border-[#222] object-cover h-36 hover:opacity-80 transition-opacity cursor-zoom-in"
                    />
                  </button>
                ) : (
                  <div className="w-full h-36 bg-[#111] border border-[#1e1e1e] rounded-xl flex flex-col items-center justify-center gap-1.5">
                    <ImageIcon size={18} className="text-[#333]" />
                    <p className="text-[#444] text-xs">Sin captura</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Note */}
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Nota para ambos jugadores (opcional)"
            className="w-full bg-[#111] border border-[#222] focus:border-[#7c3aed] rounded-xl px-4 py-2.5 text-white placeholder-[#444] outline-none text-sm transition-colors"
          />

          {/* Resolve */}
          <div className="space-y-2">
            <p className="text-[#555] text-xs text-center font-medium">¿Quién ganó realmente?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => resolve(match.player1_id)}
                disabled={isPending}
                className="flex items-center justify-center gap-2 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/18 disabled:opacity-40 border border-[#7c3aed]/35 text-[#7c3aed] font-bold py-3.5 rounded-xl transition-all text-sm"
              >
                <Crown size={14} />
                {isPending ? 'Procesando…' : `${p1Name} ganó`}
              </button>
              <button
                onClick={() => resolve(match.player2_id)}
                disabled={isPending}
                className="flex items-center justify-center gap-2 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/18 disabled:opacity-40 border border-[#7c3aed]/35 text-[#7c3aed] font-bold py-3.5 rounded-xl transition-all text-sm"
              >
                <Crown size={14} />
                {isPending ? 'Procesando…' : `${p2Name} ganó`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'disputes' | 'matches' | 'users'

export default function AdminPanel({ stats: initialStats, initialDisputes, initialActiveMatches, users }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [disputes, setDisputes] = useState<DisputedMatch[]>(initialDisputes)
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>(initialActiveMatches)
  const [stats, setStats] = useState(initialStats)
  const [liveIndicator, setLiveIndicator] = useState(false)
  const supabase = createClient()

  // ── Realtime fetch helpers ─────────────────────────────────────────────────

  const fetchDisputes = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        id, tournament_id, player1_id, player2_id, created_at,
        player1_screenshot_url, player2_screenshot_url,
        player1_claimed_winner, player2_claimed_winner,
        tournament:tournaments(title, prize_pool, game_mode),
        player1:profiles!matches_player1_id_fkey(id, username, display_name),
        player2:profiles!matches_player2_id_fkey(id, username, display_name)
      `)
      .eq('status', 'disputed')
      .order('created_at')

    if (!data) return

    const tournamentIds = data.map((m: any) => m.tournament_id).filter(Boolean)
    let epicMap: Record<string, Record<string, string | null>> = {}

    if (tournamentIds.length > 0) {
      const { data: participants } = await supabase
        .from('tournament_participants')
        .select('tournament_id, player_id, epic_username')
        .in('tournament_id', tournamentIds)
      for (const p of participants ?? []) {
        if (!epicMap[(p as any).tournament_id]) epicMap[(p as any).tournament_id] = {}
        epicMap[(p as any).tournament_id][(p as any).player_id] = (p as any).epic_username
      }
    }

    setDisputes(
      data.map((m: any) => ({
        ...m,
        player1_epic: epicMap[m.tournament_id]?.[m.player1_id] ?? null,
        player2_epic: epicMap[m.tournament_id]?.[m.player2_id] ?? null,
      }))
    )
    setStats(prev => ({ ...prev, disputesCount: data.length }))
  }

  const fetchActiveMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        id, tournament_id, player1_id, player2_id, created_at,
        player1_claimed_winner, player2_claimed_winner,
        tournament:tournaments(title, prize_pool, game_mode),
        player1:profiles!matches_player1_id_fkey(id, username, display_name),
        player2:profiles!matches_player2_id_fkey(id, username, display_name)
      `)
      .eq('status', 'in_progress')
      .order('created_at')

    if (data) setActiveMatches(data as any)
  }

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('admin-matches-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchDisputes()
        fetchActiveMatches()
        setLiveIndicator(true)
        setTimeout(() => setLiveIndicator(false), 800)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab navigation ─────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'disputes', label: 'Disputas', badge: disputes.length },
    { id: 'matches', label: 'Partidas', badge: activeMatches.length },
    { id: 'users', label: 'Usuarios' },
  ]

  return (
    <div className="space-y-6">
      {/* Live indicator + tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-[#7c3aed] text-white shadow-[0_0_16px_rgba(124,58,237,0.25)]'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`w-5 h-5 text-[10px] font-black rounded-full flex items-center justify-center ${
                  tab === t.id ? 'bg-white/20 text-white' : 'bg-yellow-400 text-black'
                }`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${liveIndicator ? 'bg-green-400' : 'bg-green-400/40'}`} />
          <span className="text-[#555] text-xs">En tiempo real</span>
          <Wifi size={11} className="text-[#444]" />
        </div>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Torneos hoy',
                value: stats.tournamentsToday,
                sub: 'creados este día',
                icon: <Swords size={17} className="text-[#7c3aed]" />,
              },
              {
                label: 'Ingresos hoy',
                value: `$${stats.revenueToday.toFixed(0)}`,
                sub: 'MXN (10% del prize pool)',
                icon: <TrendingUp size={17} className="text-[#7c3aed]" />,
                accent: true,
              },
              {
                label: 'Disputas activas',
                value: stats.disputesCount,
                sub: disputes.length === 0 ? 'Sin conflictos' : 'requieren revisión',
                icon: <ShieldAlert size={17} className={stats.disputesCount > 0 ? 'text-yellow-400' : 'text-[#7c3aed]'} />,
                warn: stats.disputesCount > 0,
              },
              {
                label: 'Usuarios registrados',
                value: stats.totalUsers,
                sub: 'en la plataforma',
                icon: <Users size={17} className="text-[#7c3aed]" />,
              },
            ].map((s, i) => (
              <div
                key={i}
                className={`bg-[#0e0e0e] border rounded-2xl p-5 ${
                  s.accent ? 'border-[#7c3aed]/25' :
                  s.warn ? 'border-yellow-400/25' :
                  'border-[#1a1a1a]'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[#555] text-xs font-medium">{s.label}</span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    s.warn ? 'bg-yellow-400/10' : 'bg-[#7c3aed]/10'
                  }`}>
                    {s.icon}
                  </div>
                </div>
                <div className={`font-black text-2xl leading-none mb-1 ${
                  s.accent ? 'text-[#7c3aed]' :
                  s.warn ? 'text-yellow-400' :
                  'text-white'
                }`}>{s.value}</div>
                <div className="text-[#444] text-xs">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Quick status */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-5">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                <ShieldAlert size={14} className="text-yellow-400" />
                Disputas recientes
              </h3>
              {disputes.length === 0 ? (
                <div className="flex items-center gap-2 text-[#555] text-sm py-2">
                  <Check size={14} className="text-green-400" />
                  Sin disputas pendientes
                </div>
              ) : (
                <div className="space-y-2">
                  {disputes.slice(0, 3).map(d => (
                    <button
                      key={d.id}
                      onClick={() => setTab('disputes')}
                      className="w-full flex items-center gap-3 text-left hover:bg-[#111] rounded-xl px-3 py-2 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-semibold truncate">{d.tournament?.title}</p>
                        <p className="text-[#555] text-[10px]">{elapsed(d.created_at)} · ${d.tournament?.prize_pool} MXN</p>
                      </div>
                      <ChevronRight size={13} className="text-[#333]" />
                    </button>
                  ))}
                  {disputes.length > 3 && (
                    <button onClick={() => setTab('disputes')} className="text-[#7c3aed] text-xs hover:underline mt-1">
                      +{disputes.length - 3} más →
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-5">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                <Swords size={14} className="text-[#7c3aed]" />
                Partidas activas
              </h3>
              {activeMatches.length === 0 ? (
                <p className="text-[#555] text-sm py-2">Ninguna en curso ahora</p>
              ) : (
                <div className="space-y-2">
                  {activeMatches.slice(0, 3).map(m => {
                    const p1r = !!m.player1_claimed_winner
                    const p2r = !!m.player2_claimed_winner
                    return (
                      <a key={m.id} href={`/match/${m.id}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 hover:bg-[#111] rounded-xl px-3 py-2 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-[#7c3aed] animate-pulse flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold truncate">{m.tournament?.title}</p>
                          <p className="text-[#555] text-[10px]">
                            {p1r && p2r ? 'Ambos reportaron' : p1r || p2r ? 'Uno reportó' : 'Sin reporte'} · {elapsed(m.created_at)}
                          </p>
                        </div>
                        <ChevronRight size={13} className="text-[#333]" />
                      </a>
                    )
                  })}
                  {activeMatches.length > 3 && (
                    <button onClick={() => setTab('matches')} className="text-[#7c3aed] text-xs hover:underline mt-1">
                      +{activeMatches.length - 3} más →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DISPUTES TAB ── */}
      {tab === 'disputes' && (
        <div className="space-y-4">
          {disputes.length === 0 ? (
            <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-10 text-center">
              <div className="w-14 h-14 bg-green-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-green-400" />
              </div>
              <p className="text-white font-bold text-lg">Sin disputas pendientes</p>
              <p className="text-[#888] text-sm mt-1">Todas las partidas se resolvieron sin conflicto.</p>
            </div>
          ) : (
            disputes.map(d => (
              <DisputeCard
                key={d.id}
                match={d}
                onResolved={(id) => setDisputes(prev => prev.filter(x => x.id !== id))}
              />
            ))
          )}
        </div>
      )}

      {/* ── MATCHES TAB ── */}
      {tab === 'matches' && (
        <div>
          {activeMatches.length === 0 ? (
            <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-10 text-center">
              <Swords size={28} className="text-[#333] mx-auto mb-3" />
              <p className="text-white font-bold">No hay partidas en curso</p>
              <p className="text-[#888] text-sm mt-1">Las partidas activas aparecerán aquí en tiempo real.</p>
            </div>
          ) : (
            <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-5 py-3 border-b border-[#1a1a1a] text-[#555] text-xs font-medium">
                <span>Torneo</span>
                <span>Jugadores</span>
                <span>Premio</span>
                <span>Tiempo</span>
                <span>Reportes</span>
              </div>
              <div className="divide-y divide-[#111]">
                {activeMatches.map(m => {
                  const p1r = !!m.player1_claimed_winner
                  const p2r = !!m.player2_claimed_winner
                  const p1n = m.player1?.display_name || m.player1?.username || 'J1'
                  const p2n = m.player2?.display_name || m.player2?.username || 'J2'
                  const elapsedSec = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 1000 / 60)
                  const isLate = elapsedSec > 30
                  return (
                    <div key={m.id} className={`grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-5 py-4 items-center hover:bg-[#111] transition-colors ${isLate ? 'bg-yellow-400/2' : ''}`}>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{m.tournament?.title}</p>
                        <p className="text-[#555] text-xs">{m.tournament?.game_mode}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{p1n}</p>
                        <p className="text-[#555] text-xs truncate">vs {p2n}</p>
                      </div>
                      <div>
                        <p className="text-[#7c3aed] font-bold text-sm">${m.tournament?.prize_pool}</p>
                        <p className="text-[#555] text-[10px]">MXN</p>
                      </div>
                      <div>
                        <p className={`text-sm font-mono font-bold ${isLate ? 'text-yellow-400' : 'text-white'}`}>
                          {elapsed(m.created_at)}
                        </p>
                        {isLate && <p className="text-yellow-400 text-[10px]">tarde</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span title={`${p1n}: ${p1r ? 'reportó' : 'pendiente'}`}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${p1r ? 'bg-green-500/20 text-green-400' : 'bg-[#1a1a1a] text-[#555]'}`}>
                            {p1r ? <Check size={10} /> : '1'}
                          </span>
                          <span title={`${p2n}: ${p2r ? 'reportó' : 'pendiente'}`}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${p2r ? 'bg-green-500/20 text-green-400' : 'bg-[#1a1a1a] text-[#555]'}`}>
                            {p2r ? <Check size={10} /> : '2'}
                          </span>
                        </div>
                        <a href={`/match/${m.id}`} target="_blank" rel="noopener noreferrer"
                          className="text-[#7c3aed] hover:underline text-xs flex-shrink-0">Ver →</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_80px_80px_70px] gap-4 px-5 py-3 border-b border-[#1a1a1a] text-[#555] text-xs font-medium">
            <span>Usuario</span>
            <span>Balance</span>
            <span>Victorias</span>
            <span>Derrotas</span>
            <span>Rol</span>
          </div>
          <div className="divide-y divide-[#111]">
            {users.map(u => {
              const name = u.display_name || u.username
              const totalGames = u.wins + u.losses
              const wr = totalGames > 0 ? Math.round((u.wins / totalGames) * 100) : 0
              return (
                <div key={u.id} className={`grid grid-cols-[1fr_100px_80px_80px_70px] gap-4 px-5 py-3.5 items-center hover:bg-[#111] transition-colors ${u.is_admin ? 'bg-[#7c3aed]/2' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${u.is_admin ? 'bg-[#7c3aed]' : 'bg-[#2a2a2a]'}`}>
                        {name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{name}</p>
                        <p className="text-[#555] text-xs">@{u.username}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${u.balance > 0 ? 'text-[#7c3aed]' : 'text-[#555]'}`}>
                      ${u.balance.toFixed(0)}
                    </p>
                    <p className="text-[#555] text-[10px]">MXN</p>
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">{u.wins}</p>
                    {totalGames > 0 && <p className="text-[#555] text-[10px]">{wr}% WR</p>}
                  </div>
                  <div>
                    <p className="text-[#888] text-sm">{u.losses}</p>
                  </div>
                  <div>
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7c3aed] bg-[#7c3aed]/10 border border-[#7c3aed]/20 px-2 py-0.5 rounded-full">
                        <BadgeCheck size={10} /> Admin
                      </span>
                    ) : (
                      <span className="text-[#444] text-[10px]">Usuario</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
