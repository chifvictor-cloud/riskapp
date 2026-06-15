'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { joinTournament, reportMatchResult } from './actions'
import { sponsorPlayer } from '@/app/match/[id]/actions'
import { Users, Trophy, AlertCircle, Clock, Swords, Crown, Gamepad2, X, Eye, Star } from 'lucide-react'
import Link from 'next/link'
import type { Database } from '@/types/database'

type Tournament = Database['public']['Tables']['tournaments']['Row']
type Match = Database['public']['Tables']['matches']['Row']

interface Profile { username: string; display_name: string | null; wins: number; losses: number; points: number }
interface Participant { id: string; tournament_id: string; player_id: string; status: string; joined_at: string; epic_username: string | null; profiles: Profile | null }

interface SponsorRecord { player_id: string; sponsor_id: string; amount: number; profiles: { username: string; display_name: string | null } | null }

interface Props {
  tournament: Tournament
  participants: Participant[]
  match: Match | null
  userId: string | null
  userEpicUsername: string | null
  sponsors?: SponsorRecord[]
}

// ── Match Found Overlay ──────────────────────────────────────────────────────
function MatchFoundOverlay({
  myEpic, rivalEpic, gameMode, prize, matchId, onDismiss,
}: {
  myEpic: string; rivalEpic: string; gameMode: string; prize: number; matchId: string | null; onDismiss: () => void
}) {
  const router = useRouter()
  const handleGo = () => {
    onDismiss()
    if (matchId) router.push(`/match/${matchId}`)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Orange ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#8b5cf6]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-full px-5 py-2 mb-4">
            <div className="w-2 h-2 bg-[#8b5cf6] rounded-full animate-pulse" />
            <span className="text-[#8b5cf6] text-sm font-bold uppercase tracking-widest">Partida encontrada</span>
          </div>
          <h1 className="text-5xl font-black text-white leading-none">⚔️</h1>
          <p className="text-[#888] mt-3 text-sm">{gameMode} · Premio: <span className="text-[#8b5cf6] font-bold">${prize} MXN</span></p>
        </div>

        {/* Players */}
        <div className="flex items-center gap-4 mb-8">
          {/* Me */}
          <div className="flex-1 bg-[#0f0e2a] border border-[#8b5cf6]/40 rounded-2xl p-5 text-center shadow-[0_0_30px_rgba(139,92,246,0.15)]">
            <div className="w-14 h-14 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white font-black text-xl mx-auto mb-3">
              {myEpic[0]?.toUpperCase() ?? 'T'}
            </div>
            <p className="text-[#888] text-xs mb-1">Tú</p>
            <p className="text-white font-bold truncate">{myEpic}</p>
          </div>

          {/* VS */}
          <div className="flex-shrink-0 text-center">
            <div className="text-[#3a375e] font-black text-2xl">VS</div>
          </div>

          {/* Rival */}
          <div className="flex-1 bg-[#0f0e2a] border border-[#3a375e] rounded-2xl p-5 text-center">
            <div className="w-14 h-14 rounded-full bg-[#3a375e] flex items-center justify-center text-white font-black text-xl mx-auto mb-3">
              {rivalEpic[0]?.toUpperCase() ?? 'R'}
            </div>
            <p className="text-[#888] text-xs mb-1">Rival</p>
            <p className="text-white font-bold truncate">{rivalEpic}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-[#0d0c26] border border-[#201e50] rounded-xl p-4 mb-6 text-center">
          <Gamepad2 size={20} className="text-[#8b5cf6] mx-auto mb-2" />
          <p className="text-white font-semibold text-sm mb-1">¡Ya puedes empezar!</p>
          <p className="text-[#888] text-xs leading-relaxed">
            Agrega a tu rival en Epic Games y crea una partida personalizada.
            Al terminar, reporta el resultado en esta página.
          </p>
        </div>

        <button
          onClick={handleGo}
          className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black py-4 rounded-xl transition-all text-lg shadow-[0_0_30px_rgba(139,92,246,0.3)]"
        >
          {matchId ? 'Ir a la sala de partida →' : 'Ver detalles de la partida'}
        </button>
      </div>
    </div>
  )
}

// ── Player Slot ──────────────────────────────────────────────────────────────
function PlayerSlot({ participant, isWinner, isMe, sponsor }: { participant: Participant | null; isWinner?: boolean; isMe?: boolean; sponsor?: SponsorRecord | null }) {
  if (!participant) {
    return (
      <div className="flex-1 bg-[#0f0e2a] border-2 border-dashed border-[#272454] rounded-xl p-5 flex flex-col items-center justify-center min-h-[130px] gap-2">
        <div className="w-10 h-10 rounded-full bg-[#1e1b4b] border-2 border-dashed border-[#2d2960] flex items-center justify-center">
          <Users size={16} className="text-[#444]" />
        </div>
        <p className="text-[#555] text-xs">Esperando rival...</p>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3a375e] animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    )
  }

  const profile = participant.profiles
  const winRate = profile && (profile.wins + profile.losses) > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0
  const displayName = profile?.display_name || profile?.username || '?'

  return (
    <div className={`flex-1 rounded-xl p-4 flex flex-col items-center border ${
      isWinner ? 'bg-[#8b5cf6]/10 border-[#8b5cf6]/40 shadow-[0_0_24px_rgba(139,92,246,0.12)]' : 'bg-[#0f0e2a] border-[#272454]'
    }`}>
      <div className="relative mb-2">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg ${isWinner ? 'bg-[#8b5cf6]' : isMe ? 'bg-[#2d2960] border-2 border-[#8b5cf6]/40' : 'bg-[#3a375e]'}`}>
          {displayName[0].toUpperCase()}
        </div>
        {isWinner && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
            <Crown size={10} className="text-yellow-900" />
          </div>
        )}
      </div>
      <p className="text-white font-bold text-sm">{displayName}</p>
      {participant.epic_username && (
        <p className="text-[#8b5cf6] text-xs mt-0.5 font-mono">{participant.epic_username}</p>
      )}
      {isMe && <span className="text-[#555] text-xs mt-0.5">Tú</span>}
      {sponsor && (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
          <Star size={7} />PATROCINADO
        </span>
      )}
      <div className="flex gap-3 mt-3 text-center">
        <div><p className="text-white font-bold text-xs">{profile?.wins ?? 0}</p><p className="text-[#555] text-[10px]">W</p></div>
        <div><p className="text-[#8b5cf6] font-bold text-xs">{winRate}%</p><p className="text-[#555] text-[10px]">WR</p></div>
        <div><p className="text-white font-bold text-xs">{profile?.points ?? 0}</p><p className="text-[#555] text-[10px]">pts</p></div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TournamentDetail({ tournament: init, participants: initP, match: initM, userId, userEpicUsername, sponsors: initSponsors = [] }: Props) {
  const [tournament, setTournament] = useState(init)
  const [participants, setParticipants] = useState(initP)
  const [match, setMatch] = useState(initM)
  const [sponsors, setSponsors] = useState(initSponsors)
  const [error, setError] = useState<string | null>(null)
  const [reportingResult, setReportingResult] = useState(false)
  const [sponsoring, setSponsoring] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Join flow state
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [epicInput, setEpicInput] = useState(userEpicUsername ?? '')

  // Match found overlay
  const [matchFoundData, setMatchFoundData] = useState<{ myEpic: string; rivalEpic: string; matchId: string | null } | null>(null)
  const prevStatus = useRef(init.status)

  const supabase = createClient()

  const player1 = participants[0] ?? null
  const player2 = participants[1] ?? null
  const userParticipant = participants.find(p => p.player_id === userId)
  const isInTournament = !!userParticipant
  const isActiveMatch = match?.status === 'in_progress' && isInTournament
  const statusConfig = {
    open: { label: 'Abierto', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', dot: 'bg-green-400 animate-pulse' },
    in_progress: { label: 'En curso', color: 'text-[#8b5cf6]', bg: 'bg-[#8b5cf6]/10 border-[#8b5cf6]/20', dot: 'bg-[#8b5cf6] animate-pulse' },
    completed: { label: 'Completado', color: 'text-[#888]', bg: 'bg-[#888]/10 border-[#888]/20', dot: 'bg-[#888]' },
    cancelled: { label: 'Cancelado', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', dot: 'bg-red-400' },
  }
  const status = statusConfig[tournament.status as keyof typeof statusConfig] ?? statusConfig.open

  // Realtime: tournament + participants + matches
  useEffect(() => {
    const channel = supabase
      .channel(`tournament:${tournament.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_participants',
        filter: `tournament_id=eq.${tournament.id}`,
      }, async () => {
        const { data } = await supabase
          .from('tournament_participants')
          .select('*, profiles(username, display_name, wins, losses, points)')
          .eq('tournament_id', tournament.id)
          .order('joined_at')
        if (data) setParticipants(data as Participant[])
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tournaments',
        filter: `id=eq.${tournament.id}`,
      }, (payload) => {
        const updated = payload.new as Tournament
        // If waiting and now matched → show overlay for player 1
        if (
          prevStatus.current === 'open' &&
          updated.status === 'in_progress' &&
          isInTournament &&
          userId
        ) {
          // Re-fetch participants + match to get rival info and matchId
          Promise.all([
            supabase
              .from('tournament_participants')
              .select('*, profiles(username, display_name, wins, losses, points)')
              .eq('tournament_id', tournament.id)
              .order('joined_at'),
            supabase
              .from('matches')
              .select('id, tournament_id')
              .eq('tournament_id', tournament.id)
              .maybeSingle(),
          ]).then(([{ data: pData }, { data: mDataRaw }]) => {
            if (!pData) return
            const mData = mDataRaw as { id: string } | null
            setParticipants(pData as Participant[])
            const myP = (pData as Participant[]).find(p => p.player_id === userId)
            const rival = (pData as Participant[]).find(p => p.player_id !== userId)
            if (myP && rival) {
              setMatchFoundData({
                myEpic: myP.epic_username || userEpicUsername || 'Tú',
                rivalEpic: rival.epic_username || rival.profiles?.username || 'Rival',
                matchId: mData?.id ?? null,
              })
            }
          })
        }
        prevStatus.current = updated.status
        setTournament(prev => ({ ...prev, ...updated }))
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${tournament.id}`,
      }, async () => {
        const { data } = await supabase
          .from('matches').select('*').eq('tournament_id', tournament.id).maybeSingle()
        setMatch(data as Match | null)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tournament.id, isInTournament, userId])

  const handleJoin = () => {
    if (!epicInput.trim()) return
    setError(null)
    setShowJoinForm(false)
    startTransition(async () => {
      const result = await joinTournament(tournament.id, epicInput.trim())
      if ('error' in result) {
        setError(result.error ?? 'Error al unirse al torneo')
        setShowJoinForm(true)
      } else if (result.matched) {
        setMatchFoundData({
          myEpic: epicInput.trim(),
          rivalEpic: result.rivalEpic ?? 'Rival',
          matchId: result.matchId ?? null,
        })
      }
    })
  }

  const handleReportResult = (winnerId: string) => {
    if (!match) return
    setError(null)
    setReportingResult(false)
    startTransition(async () => {
      const result = await reportMatchResult(match.id, winnerId)
      if ('error' in result) {
        setError(result.error ?? 'Error al reportar resultado')
      }
    })
  }

  return (
    <>
      {/* Match Found Overlay */}
      {matchFoundData && (
        <MatchFoundOverlay
          myEpic={matchFoundData.myEpic}
          rivalEpic={matchFoundData.rivalEpic}
          gameMode={tournament.game_mode}
          prize={tournament.prize_pool}
          matchId={matchFoundData.matchId}
          onDismiss={() => setMatchFoundData(null)}
        />
      )}

      <div className="space-y-5">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Status banner */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${status.bg}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
            <div>
              <p className={`font-bold text-sm ${status.color}`}>{status.label}</p>
              <p className="text-[#888] text-xs">
                {tournament.status === 'open' && `${tournament.current_players}/2 jugadores`}
                {tournament.status === 'in_progress' && 'Partida en curso'}
                {tournament.status === 'completed' && 'Torneo finalizado'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[#8b5cf6] font-black text-xl">${tournament.prize_pool}</p>
            <p className="text-[#888] text-xs">MXN</p>
          </div>
        </div>

        {/* Players matchup */}
        <div className="bg-[#0d0c26] border border-[#1e1b4b] rounded-2xl p-5">
          <h2 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
            <Swords size={15} className="text-[#8b5cf6]" /> Jugadores
          </h2>
          <div className="flex items-stretch gap-3">
            <PlayerSlot
              participant={player1}
              isWinner={!!match?.winner_id && match.winner_id === player1?.player_id}
              isMe={player1?.player_id === userId}
              sponsor={sponsors.find(s => s.player_id === player1?.player_id)}
            />
            <div className="flex items-center justify-center px-1">
              <span className="text-[#2d2960] font-black text-sm">VS</span>
            </div>
            <PlayerSlot
              participant={player2}
              isWinner={!!match?.winner_id && match.winner_id === player2?.player_id}
              isMe={player2?.player_id === userId}
              sponsor={sponsors.find(s => s.player_id === player2?.player_id)}
            />
          </div>
        </div>

        {/* Action area */}
        {userId ? (
          <>
            {/* JOIN FORM */}
            {tournament.status === 'open' && !isInTournament && (
              <>
                {!showJoinForm ? (
                  <button
                    onClick={() => setShowJoinForm(true)}
                    disabled={isPending}
                    className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white font-black text-lg py-4 rounded-xl transition-all shadow-[0_0_25px_rgba(139,92,246,0.2)] hover:shadow-[0_0_35px_rgba(139,92,246,0.35)]"
                  >
                    {isPending ? 'Procesando...' : `Aceptar reto · $${tournament.entry_fee} MXN`}
                  </button>
                ) : (
                  <div className="bg-[#0d0c26] border border-[#8b5cf6]/30 rounded-2xl p-5">
                    <h3 className="text-white font-bold mb-1">Tu nombre en Epic Games</h3>
                    <p className="text-[#888] text-xs mb-4">
                      Tu rival verá este nombre para agregarte en Fortnite
                    </p>
                    <input
                      type="text"
                      value={epicInput}
                      onChange={e => setEpicInput(e.target.value)}
                      placeholder="EpicUsername123"
                      maxLength={32}
                      className="w-full bg-[#0f0e2a] border border-[#272454] focus:border-[#8b5cf6] rounded-xl px-4 py-3 text-white placeholder-[#444] outline-none transition-colors mb-3 font-mono"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleJoin}
                        disabled={!epicInput.trim() || isPending}
                        className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors"
                      >
                        {isPending ? 'Uniéndose...' : `Confirmar · $${tournament.entry_fee} MXN`}
                      </button>
                      <button
                        onClick={() => setShowJoinForm(false)}
                        className="px-4 bg-[#0f0e2a] border border-[#272454] text-[#888] hover:text-white rounded-xl transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* SPONSOR BUTTON — shown to non-participants when player1 exists but no player2 yet */}
            {tournament.status === 'open' && !isInTournament && player1 && !player2 && userId && player1.player_id !== userId && !sponsors.find(s => s.player_id === player1.player_id) && (
              <div className="bg-[#08071a] border border-yellow-400/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star size={14} className="text-yellow-400" />
                  <p className="text-white font-bold text-sm">Patrocinar a este jugador</p>
                </div>
                <p className="text-[#888] text-xs mb-3">
                  Paga la entrada (${tournament.entry_fee} MXN) por él. Si gana: 60% para el jugador, 40% para ti.
                </p>
                <button
                  onClick={() => {
                    setSponsoring(true)
                    startTransition(async () => {
                      const result = await sponsorPlayer(tournament.id, player1.player_id)
                      setSponsoring(false)
                      if ('error' in result) {
                        setError(result.error ?? 'Error al patrocinar')
                      }
                    })
                  }}
                  disabled={sponsoring || isPending}
                  className="w-full bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 font-bold py-2.5 rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  {sponsoring ? 'Procesando...' : `Patrocinar · $${tournament.entry_fee} MXN`}
                </button>
              </div>
            )}

            {/* WAITING */}
            {tournament.status === 'open' && isInTournament && (
              <div className="bg-[#0d0c26] border border-[#201e50] rounded-2xl p-6 text-center">
                <Clock size={28} className="text-[#8b5cf6] mx-auto mb-3 animate-pulse" />
                <h3 className="text-white font-bold mb-1">Esperando rival</h3>
                <p className="text-[#888] text-sm">
                  Cuando alguien acepte el reto, ambos verán la pantalla de partida encontrada.
                </p>
                {userParticipant?.epic_username && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-[#0f0e2a] border border-[#272454] rounded-lg px-3 py-1.5">
                    <span className="text-[#888] text-xs">Tu Epic:</span>
                    <span className="text-[#8b5cf6] text-sm font-mono font-bold">{userParticipant.epic_username}</span>
                  </div>
                )}
                <div className="flex justify-center gap-1.5 mt-5">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-[#8b5cf6] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* IN_PROGRESS — report result */}
            {isActiveMatch && !match?.winner_id && (
              <div className="bg-[#0d0c26] border border-[#8b5cf6]/20 rounded-2xl p-5">
                <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                  <Trophy size={15} className="text-[#8b5cf6]" />
                  ¿Terminaron la partida?
                </h3>
                <p className="text-[#888] text-sm mb-4">Reporta el resultado honestamente.</p>
                {!reportingResult ? (
                  <button
                    onClick={() => setReportingResult(true)}
                    className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    Reportar resultado
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[#888] text-xs mb-3">¿Quién ganó?</p>
                    {[player1, player2].filter(Boolean).map(p => (
                      <button
                        key={p!.player_id}
                        onClick={() => handleReportResult(p!.player_id)}
                        disabled={isPending}
                        className="w-full flex items-center gap-3 bg-[#0f0e2a] hover:bg-[#1e1b4b] border border-[#201e50] hover:border-[#8b5cf6]/40 text-white py-3 px-4 rounded-xl transition-all disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#8b5cf6]/15 flex items-center justify-center text-[#8b5cf6] font-bold text-sm">
                          {(p!.profiles?.display_name || p!.profiles?.username || '?')[0].toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">{p!.profiles?.display_name || p!.profiles?.username}{p!.player_id === userId && ' (yo)'}</p>
                          {p!.epic_username && <p className="text-[#8b5cf6] text-xs font-mono">{p!.epic_username}</p>}
                        </div>
                        <Trophy size={13} className="ml-auto text-[#8b5cf6]" />
                      </button>
                    ))}
                    <button onClick={() => setReportingResult(false)} className="w-full text-[#555] text-xs py-2 hover:text-[#888]">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          tournament.status === 'open' && (
            <a href="/auth/login" className="block w-full text-center bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black text-lg py-4 rounded-xl transition-colors">
              Inicia sesión para unirte
            </a>
          )
        )}

        {/* Ver en vivo link for active matches */}
        {match && match.status === 'in_progress' && (
          <Link
            href={`/match/${match.id}/spectate`}
            className="flex items-center justify-center gap-2 w-full bg-[#8b5cf6]/8 hover:bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 text-[#8b5cf6] font-semibold py-3 rounded-xl transition-all text-sm"
          >
            <Eye size={14} />
            Ver en vivo como espectador
            {(match as any).spectator_count > 0 && (
              <span className="text-[#8b5cf6]/60 text-xs">· {(match as any).spectator_count} viendo</span>
            )}
          </Link>
        )}

        {/* Completed result */}
        {tournament.status === 'completed' && match?.winner_id && (
          <div className="bg-[#0d0c26] border border-yellow-400/20 rounded-2xl p-5 text-center">
            <Crown size={28} className="text-yellow-400 mx-auto mb-2" />
            <p className="text-[#888] text-xs mb-1">Ganador</p>
            <p className="text-white font-black text-xl">
              {participants.find(p => p.player_id === match.winner_id)?.profiles?.display_name
                || participants.find(p => p.player_id === match.winner_id)?.profiles?.username || '—'}
            </p>
            {participants.find(p => p.player_id === match.winner_id)?.epic_username && (
              <p className="text-[#8b5cf6] text-sm font-mono mt-1">
                {participants.find(p => p.player_id === match.winner_id)?.epic_username}
              </p>
            )}
            <p className="text-[#888] text-xs mt-2">Premio cobrado: <span className="text-[#8b5cf6] font-bold">${tournament.prize_pool} MXN</span></p>
          </div>
        )}
      </div>
    </>
  )
}
