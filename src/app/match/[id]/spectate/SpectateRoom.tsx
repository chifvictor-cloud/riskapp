'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, Send, Crown, Star, Clock, Trophy, MessageCircle, Coins, TrendingUp, Lock, ChevronDown } from 'lucide-react'
import MisApuestas from '@/components/MisApuestas'

interface Player {
  player_id: string
  epic_username: string | null
  profiles: {
    username: string
    display_name: string | null
    wins: number
    losses: number
    points: number
    is_vip: boolean
  } | null
}

interface ChatMessage {
  id: string
  user_id: string
  content: string
  created_at: string
  profiles: { username: string; is_vip: boolean } | null
}

interface SponsorRecord {
  player_id: string
  sponsor_id: string
  amount: number
  profiles: { username: string; display_name: string | null } | null
}

interface MatchBet {
  bet_on: string
  amount: number
  status: 'open' | 'won' | 'lost' | 'refunded'
  payout: number
  round_id?: string | null
}

interface BetRound {
  id: string
  round_number: number
  closes_at: string
}

interface Props {
  match: any
  tournament: any
  player1: Player | null
  player2: Player | null
  userId: string
  mySession: { voted_for: string | null; points_earned: number; left_at: string | null } | null
  initialVoteCounts: Record<string, number>
  initialMessages: ChatMessage[]
  sponsors: SponsorRecord[]
  initialBetTotals: Record<string, number>
  myBet: MatchBet | null
  myPoints: number
  activeRound: BetRound | null
  initialRoundBetTotals: Record<string, number>
  myRoundBet: MatchBet | null
}

function StreamEmbed({ url }: { url: string }) {
  const isTwitch = url.includes('twitch.tv')
  const isTikTok = url.includes('tiktok.com')

  if (isTwitch) {
    const parts = url.split('/')
    const channel = parts[parts.length - 1]?.split('?')[0] ?? ''
    if (!channel) return null
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    return (
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden mb-5">
        <iframe
          src={`https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=false`}
          className="w-full h-full"
          allowFullScreen
        />
      </div>
    )
  }

  if (isTikTok) {
    return (
      <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-xl p-4 mb-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#8b5cf6]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <Eye size={18} className="text-[#8b5cf6]" />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Stream en TikTok Live</p>
          <p className="text-[#888] text-xs">TikTok no permite embeber streams</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8b5cf6] text-sm font-bold hover:underline flex-shrink-0"
        >
          Ver en TikTok →
        </a>
      </div>
    )
  }

  return null
}

function MatchArena({
  p1Name, p2Name, p1EpicUsername, p2EpicUsername,
  p1Profile, p2Profile, p1WR, p2WR,
  prizePool, gameMode, elapsed, formatTime,
}: {
  p1Name: string; p2Name: string
  p1EpicUsername: string | null; p2EpicUsername: string | null
  p1Profile: { wins: number; losses: number; points: number } | null
  p2Profile: { wins: number; losses: number; points: number } | null
  p1WR: number; p2WR: number
  prizePool: number; gameMode: string
  elapsed: number; formatTime: (s: number) => string
}) {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden mb-5" style={{ minHeight: '260px' }}>
      <style>{`
        @keyframes arena-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes vs-glow {
          0%, 100% { text-shadow: 0 0 16px rgba(139,92,246,0.7); transform: scale(1); }
          50%       { text-shadow: 0 0 36px rgba(139,92,246,1), 0 0 72px rgba(139,92,246,0.4); transform: scale(1.08); }
        }
        .arena-float-1 { animation: arena-float 3.2s ease-in-out infinite; }
        .arena-float-2 { animation: arena-float 3.2s ease-in-out infinite 0.6s; }
        .vs-glow       { animation: vs-glow 2s ease-in-out infinite; }
      `}</style>

      {/* Dark base */}
      <div className="absolute inset-0 bg-[#08071a]" />
      {/* Grid pattern */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }} />
      {/* Purple glow blob, center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-80 h-48 rounded-full bg-[#8b5cf6]/8 blur-3xl" />
      </div>
      {/* Border ring */}
      <div className="absolute inset-0 rounded-2xl border border-[#1e1b4b]" />

      <div className="relative z-10 px-6 py-5">
        {/* Top bar: prize + EN VIVO */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-yellow-400 flex-shrink-0" />
            <span className="text-yellow-400 font-black text-sm">${prizePool} MXN en juego</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 font-bold text-[11px] uppercase tracking-wider">En vivo</span>
          </div>
        </div>

        {/* Game mode label */}
        <p className="text-center text-[#444] text-[11px] uppercase tracking-[0.2em] mb-5">{gameMode}</p>

        {/* Players + VS */}
        <div className="flex items-center gap-3">

          {/* Player 1 */}
          <div className="flex-1 flex flex-col items-center text-center">
            <div className="player-frame mb-3 w-[72px] h-[72px] rounded-full border-2 border-[#8b5cf6] bg-[#8b5cf6]/10 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.35)] arena-float-1">
              <span className="text-white font-black text-2xl select-none">{p1Name[0]?.toUpperCase()}</span>
            </div>
            <p className="text-white font-bold text-sm leading-tight">{p1Name}</p>
            {p1EpicUsername && (
              <p className="text-[#8b5cf6] text-[11px] font-mono mt-0.5 truncate max-w-[110px]">{p1EpicUsername}</p>
            )}
            {p1Profile && (
              <div className="flex gap-2.5 mt-2">
                <div><p className="text-white text-[11px] font-bold">{p1Profile.wins}</p><p className="text-[#555] text-[9px]">W</p></div>
                <div><p className="text-[#8b5cf6] text-[11px] font-bold">{p1WR}%</p><p className="text-[#555] text-[9px]">WR</p></div>
                <div><p className="text-white text-[11px] font-bold">{p1Profile.points}</p><p className="text-[#555] text-[9px]">pts</p></div>
              </div>
            )}
          </div>

          {/* VS + timer */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0 px-2">
            <span className="vs-glow text-[#8b5cf6] font-black text-[2.5rem] leading-none">VS</span>
            <div className="bg-[#0f0e2a] border border-[#272454] rounded-lg px-3 py-1.5 min-w-[64px] text-center">
              <span className="text-white font-mono font-bold text-sm">{formatTime(elapsed)}</span>
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex-1 flex flex-col items-center text-center">
            <div className="player-frame mb-3 w-[72px] h-[72px] rounded-full border-2 border-[#3b82f6] bg-[#3b82f6]/10 flex items-center justify-center shadow-[0_0_18px_rgba(59,130,246,0.35)] arena-float-2">
              <span className="text-white font-black text-2xl select-none">{p2Name[0]?.toUpperCase()}</span>
            </div>
            <p className="text-white font-bold text-sm leading-tight">{p2Name}</p>
            {p2EpicUsername && (
              <p className="text-[#3b82f6] text-[11px] font-mono mt-0.5 truncate max-w-[110px]">{p2EpicUsername}</p>
            )}
            {p2Profile && (
              <div className="flex gap-2.5 mt-2">
                <div><p className="text-white text-[11px] font-bold">{p2Profile.wins}</p><p className="text-[#555] text-[9px]">W</p></div>
                <div><p className="text-[#3b82f6] text-[11px] font-bold">{p2WR}%</p><p className="text-[#555] text-[9px]">WR</p></div>
                <div><p className="text-white text-[11px] font-bold">{p2Profile.points}</p><p className="text-[#555] text-[9px]">pts</p></div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function BettingPanel({
  p1Name, p2Name, player1Id, player2Id,
  bettingOpen, bettingSecondsLeft,
  betTotals, myBet, myPoints,
  betTarget, setBetTarget,
  betAmount, setBetAmount,
  betError, placingBet, onPlaceBet,
  title = 'Apuestas pari-mutuel',
}: {
  match: any
  p1Name: string
  p2Name: string
  player1Id: string
  player2Id: string
  bettingOpen: boolean
  bettingSecondsLeft: number
  betTotals: Record<string, number>
  myBet: MatchBet | null
  myPoints: number
  betTarget: string | null
  setBetTarget: (id: string) => void
  betAmount: string
  setBetAmount: (v: string) => void
  betError: string | null
  placingBet: boolean
  onPlaceBet: () => void
  title?: string
}) {
  const p1Total = betTotals[player1Id] ?? 0
  const p2Total = betTotals[player2Id] ?? 0
  const grandTotal = p1Total + p2Total
  const p1Pct = grandTotal > 0 ? Math.round((p1Total / grandTotal) * 100) : 50
  const p2Pct = grandTotal > 0 ? 100 - p1Pct : 50

  const betStatusLabel = (status: MatchBet['status']) => {
    const map = { open: 'En juego', won: '¡Ganaste!', lost: 'Perdiste', refunded: 'Reembolsado' }
    return map[status]
  }
  const betStatusColor = (status: MatchBet['status']) => {
    const map = { open: 'text-[#e85d24]', won: 'text-yellow-400', lost: 'text-red-400', refunded: 'text-[#888]' }
    return map[status]
  }

  return (
    <div className="bg-[#111] border border-[#e85d24]/20 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#e85d24]/10 rounded-lg flex items-center justify-center">
            <TrendingUp size={14} className="text-[#e85d24]" />
          </div>
          <span className="text-white font-bold text-sm">{title}</span>
        </div>

        {bettingOpen ? (
          <div className="flex items-center gap-2 bg-[#e85d24]/10 border border-[#e85d24]/20 rounded-full px-3 py-1">
            <div className="w-1.5 h-1.5 bg-[#e85d24] rounded-full animate-pulse" />
            <span className="text-[#e85d24] font-mono font-bold text-xs">{bettingSecondsLeft}s</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[#555] text-xs">
            <Lock size={11} />
            <span>Ventana cerrada</span>
          </div>
        )}
      </div>

      {/* Pot bars */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#8b5cf6] font-bold truncate max-w-[120px]">{p1Name}</span>
          <span className="text-[#555]">Pozo: <span className="text-white font-bold">{grandTotal} pts</span></span>
          <span className="text-[#3b82f6] font-bold truncate max-w-[120px] text-right">{p2Name}</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-[#222]">
          <div
            className="bg-[#8b5cf6] transition-all duration-700"
            style={{ width: `${p1Pct}%` }}
          />
          <div
            className="bg-[#3b82f6] transition-all duration-700"
            style={{ width: `${p2Pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-[#8b5cf6]">{p1Total} pts · {p1Pct}%</span>
          <span className="text-[#3b82f6]">{p2Total} pts · {p2Pct}%</span>
        </div>
      </div>

      {/* My bet result */}
      {myBet && (
        <div className={`bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 flex items-center justify-between ${myBet.status !== 'open' ? 'mb-0' : 'mb-0'}`}>
          <div className="flex items-center gap-2">
            <Coins size={14} className="text-[#e85d24]" />
            <span className="text-[#888] text-sm">Tu apuesta: <span className="text-white font-bold">{myBet.amount} pts</span></span>
          </div>
          <div className="text-right">
            <span className={`text-sm font-bold ${betStatusColor(myBet.status)}`}>{betStatusLabel(myBet.status)}</span>
            {myBet.status === 'won' && myBet.payout > 0 && (
              <span className="text-yellow-400 text-xs ml-2">+{myBet.payout} pts</span>
            )}
          </div>
        </div>
      )}

      {/* Bet form — only when window open and no existing bet */}
      {!myBet && (
        <div className={`transition-opacity ${bettingOpen ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Player selector */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              onClick={() => setBetTarget(player1Id)}
              className={`rounded-xl border p-3 text-center transition-all ${
                betTarget === player1Id
                  ? 'border-[#8b5cf6] bg-[#8b5cf6]/10'
                  : 'border-[#222] bg-[#0a0a0a] hover:border-[#8b5cf6]/40'
              }`}
            >
              <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white font-black text-sm ${
                betTarget === player1Id ? 'bg-[#8b5cf6]' : 'bg-[#1e1b4b]'
              }`}>
                {p1Name[0]?.toUpperCase()}
              </div>
              <p className="text-white text-xs font-bold truncate">{p1Name}</p>
              <p className="text-[#8b5cf6] text-[10px] mt-0.5">{p1Total} pts apostados</p>
            </button>

            <button
              onClick={() => setBetTarget(player2Id)}
              className={`rounded-xl border p-3 text-center transition-all ${
                betTarget === player2Id
                  ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                  : 'border-[#222] bg-[#0a0a0a] hover:border-[#3b82f6]/40'
              }`}
            >
              <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white font-black text-sm ${
                betTarget === player2Id ? 'bg-[#3b82f6]' : 'bg-[#1e2a4a]'
              }`}>
                {p2Name[0]?.toUpperCase()}
              </div>
              <p className="text-white text-xs font-bold truncate">{p2Name}</p>
              <p className="text-[#3b82f6] text-[10px] mt-0.5">{p2Total} pts apostados</p>
            </button>
          </div>

          {/* Amount + quick picks */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <input
                type="number"
                min={10}
                max={1000}
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                placeholder="Monto (10–1000)"
                className="w-full bg-[#0a0a0a] border border-[#222] focus:border-[#e85d24] rounded-lg px-3 py-2.5 text-white placeholder-[#444] outline-none text-sm transition-colors"
              />
            </div>
            {[50, 100, 200, 500].map(v => (
              <button
                key={v}
                onClick={() => setBetAmount(String(v))}
                className="px-2.5 py-2.5 bg-[#0a0a0a] border border-[#222] hover:border-[#e85d24]/40 rounded-lg text-[#888] hover:text-white text-xs font-bold transition-colors flex-shrink-0"
              >
                {v}
              </button>
            ))}
          </div>

          {/* Points hint */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[#555] text-xs flex items-center gap-1">
              <Coins size={10} />
              Saldo: <span className="text-white">{myPoints} pts</span>
            </span>
            {betTarget && betAmount && parseInt(betAmount) >= 10 && grandTotal > 0 && (
              <span className="text-[#555] text-xs">
                Pago estimado: ~<span className="text-[#e85d24] font-bold">
                  {Math.floor(parseInt(betAmount) * (grandTotal + parseInt(betAmount)) * 0.95 / ((betTotals[betTarget] ?? 0) + parseInt(betAmount)))} pts
                </span>
              </span>
            )}
          </div>

          {betError && (
            <p className="text-red-400 text-xs mb-2">{betError}</p>
          )}

          <button
            onClick={onPlaceBet}
            disabled={!betTarget || !bettingOpen || placingBet}
            className="w-full bg-[#e85d24] hover:bg-[#d04e1a] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            {placingBet ? 'Procesando...' : bettingOpen ? 'Apostar' : 'Ventana cerrada'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function SpectateRoom({
  match: initMatch,
  tournament,
  player1,
  player2,
  userId,
  mySession,
  initialVoteCounts,
  initialMessages,
  sponsors,
  initialBetTotals,
  myBet: initMyBet,
  myPoints: initMyPoints,
  activeRound,
  initialRoundBetTotals,
  myRoundBet: initMyRoundBet,
}: Props) {
  const supabase = createClient()

  const [match, setMatch] = useState(initMatch)
  const [voteCounts, setVoteCounts] = useState(initialVoteCounts)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [myVote, setMyVote] = useState<string | null>(mySession?.voted_for ?? null)
  const [elapsed, setElapsed] = useState(0)
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [sendingChat, setSendingChat] = useState(false)
  const [predictionAwarded, setPredictionAwarded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [showMyBets, setShowMyBets] = useState(false)

  // Betting state
  const [betTotals, setBetTotals] = useState<Record<string, number>>(initialBetTotals)
  const [myBet, setMyBet] = useState<MatchBet | null>(initMyBet)
  const [myPoints, setMyPoints] = useState(initMyPoints)
  const [betTarget, setBetTarget] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState('100')
  const [bettingSecondsLeft, setBettingSecondsLeft] = useState(0)
  const [placingBet, setPlacingBet] = useState(false)
  const [betError, setBetError] = useState<string | null>(null)

  // Extra betting rounds state
  const [betRound, setBetRound] = useState<BetRound | null>(activeRound)
  const [roundBetTotals, setRoundBetTotals] = useState<Record<string, number>>(initialRoundBetTotals)
  const [myRoundBet, setMyRoundBet] = useState<MatchBet | null>(initMyRoundBet)
  const [roundBetTarget, setRoundBetTarget] = useState<string | null>(null)
  const [roundBetAmount, setRoundBetAmount] = useState('100')
  const [roundSecondsLeft, setRoundSecondsLeft] = useState(0)
  const [placingRoundBet, setPlacingRoundBet] = useState(false)
  const [roundBetError, setRoundBetError] = useState<string | null>(null)
  const [showNewRoundBanner, setShowNewRoundBanner] = useState(false)

  // Los handlers realtime se crean una sola vez; el ref evita closures viejos sobre la ronda activa
  const betRoundRef = useRef<BetRound | null>(activeRound)
  useEffect(() => { betRoundRef.current = betRound }, [betRound])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const hasLeft = useRef(false)

  // Match elapsed timer
  useEffect(() => {
    const startTime = new Date(match.created_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [match.created_at])

  // Betting countdown timer
  useEffect(() => {
    if (!match.betting_closes_at) return
    const closesAt = new Date(match.betting_closes_at).getTime()
    const tick = () => {
      const left = Math.max(0, Math.ceil((closesAt - Date.now()) / 1000))
      setBettingSecondsLeft(left)
    }
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [match.betting_closes_at])

  // Extra round countdown timer
  useEffect(() => {
    if (!betRound) { setRoundSecondsLeft(0); return }
    const closesAt = new Date(betRound.closes_at).getTime()
    const tick = () => setRoundSecondsLeft(Math.max(0, Math.ceil((closesAt - Date.now()) / 1000)))
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [betRound])

  // Join spectate on mount
  useEffect(() => {
    ;(supabase as any).rpc('join_spectate', { p_match_id: match.id })

    const handleLeave = () => {
      if (!hasLeft.current) {
        hasLeft.current = true
        ;(supabase as any).rpc('leave_spectate', { p_match_id: match.id })
      }
    }

    window.addEventListener('beforeunload', handleLeave)
    return () => {
      handleLeave()
      window.removeEventListener('beforeunload', handleLeave)
    }
  }, [match.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: match updates
  useEffect(() => {
    const channel = supabase
      .channel(`spectate-match-${match.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `id=eq.${match.id}`,
      }, async (payload) => {
        const updated = payload.new as any
        setMatch(updated)

        // Match completed — award prediction points if voted correctly
        if (updated.winner_id && updated.status === 'completed' && !predictionAwarded) {
          setPredictionAwarded(true)
          await (supabase as any).rpc('award_correct_prediction', { p_match_id: match.id })
          // Also call leave_spectate
          if (!hasLeft.current) {
            hasLeft.current = true
            await (supabase as any).rpc('leave_spectate', { p_match_id: match.id })
          }
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'spectator_sessions',
        filter: `match_id=eq.${match.id}`,
      }, async () => {
        // Re-fetch vote counts
        const { data } = await (supabase as any)
          .from('spectator_sessions')
          .select('voted_for')
          .eq('match_id', match.id)
          .not('voted_for', 'is', null)
        if (data) {
          const counts: Record<string, number> = {}
          for (const s of data) {
            if (s.voted_for) counts[s.voted_for] = (counts[s.voted_for] ?? 0) + 1
          }
          setVoteCounts(counts)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'spectator_chat_messages',
        filter: `match_id=eq.${match.id}`,
      }, async (payload) => {
        const msg = payload.new as any
        // Fetch sender profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, is_vip')
          .eq('id', msg.user_id)
          .single()
        setMessages(prev => [...prev, { ...msg, profiles: profile ?? null }])
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'match_bets',
        filter: `match_id=eq.${match.id}`,
      }, (payload) => {
        const bet = payload.new as any
        if (bet.user_id === userId) return // already counted optimistically on place
        if (bet.status !== 'open') return
        if (!bet.round_id) {
          setBetTotals(prev => ({
            ...prev,
            [bet.bet_on]: (prev[bet.bet_on] ?? 0) + bet.amount,
          }))
        } else if (bet.round_id === betRoundRef.current?.id) {
          setRoundBetTotals(prev => ({
            ...prev,
            [bet.bet_on]: (prev[bet.bet_on] ?? 0) + bet.amount,
          }))
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'match_bets',
        filter: `match_id=eq.${match.id}`,
      }, (payload) => {
        const bet = payload.new as any
        // Update myBet if it's mine
        if (bet.user_id === userId) {
          if (!bet.round_id) setMyBet(bet as MatchBet)
          else if (bet.round_id === betRoundRef.current?.id) setMyRoundBet(bet as MatchBet)
        }
        // Rebuild totals from DB on any update (resolve/refund)
        if (bet.status !== 'open') {
          if (!bet.round_id) {
            setBetTotals(prev => ({
              ...prev,
              [bet.bet_on]: Math.max(0, (prev[bet.bet_on] ?? 0) - bet.amount),
            }))
          } else if (bet.round_id === betRoundRef.current?.id) {
            setRoundBetTotals(prev => ({
              ...prev,
              [bet.bet_on]: Math.max(0, (prev[bet.bet_on] ?? 0) - bet.amount),
            }))
          }
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bet_rounds',
        filter: `match_id=eq.${match.id}`,
      }, (payload) => {
        const round = payload.new as BetRound
        setBetRound(round)
        setRoundBetTotals({})
        setMyRoundBet(null)
        setRoundBetTarget(null)
        setRoundBetError(null)
        setShowNewRoundBanner(true)
        setTimeout(() => setShowNewRoundBanner(false), 5000)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [match.id, predictionAwarded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleVote = (playerId: string) => {
    if (myVote || match.status !== 'in_progress') return
    setMyVote(playerId)
    setVoteCounts(prev => ({ ...prev, [playerId]: (prev[playerId] ?? 0) + 1 }))
    startTransition(async () => {
      await (supabase as any).rpc('vote_for_player', { p_match_id: match.id, p_voted_for: playerId })
    })
  }

  const handleSendChat = async () => {
    const text = chatInput.trim()
    if (!text || sendingChat) return
    setChatInput('')
    setChatError(null)
    setSendingChat(true)
    try {
      const { error } = await (supabase as any).rpc('send_chat_message', {
        p_match_id: match.id,
        p_content: text,
      })
      if (error?.message === 'rate_limit') {
        setChatError('Espera un momento antes de enviar otro mensaje')
      }
    } finally {
      setSendingChat(false)
    }
  }

  const handlePlaceBet = async () => {
    if (!betTarget || placingBet || myBet) return
    const amount = parseInt(betAmount, 10)
    if (isNaN(amount) || amount < 10 || amount > 1000) {
      setBetError('El monto debe estar entre 10 y 1000 pts')
      return
    }
    if (amount > myPoints) {
      setBetError('Puntos insuficientes')
      return
    }
    setBetError(null)
    setPlacingBet(true)
    try {
      const { data, error } = await (supabase as any).rpc('place_bet', {
        p_match_id: match.id,
        p_bet_on: betTarget,
        p_amount: amount,
      })
      if (error || data?.error) {
        const code = data?.error ?? error?.message
        const msgs: Record<string, string> = {
          betting_window_closed: 'La ventana de apuestas ya cerró',
          already_bet: 'Ya tienes una apuesta en este match',
          insufficient_points: 'Puntos insuficientes',
          invalid_amount: 'Monto inválido (10–1000)',
          invalid_bet_target: 'Jugador inválido',
          not_authenticated: 'Debes iniciar sesión',
          players_cannot_bet: 'Los jugadores no pueden apostar en su propia partida',
        }
        setBetError(msgs[code] ?? 'Error al apostar')
        return
      }
      setMyBet({ bet_on: betTarget, amount, status: 'open', payout: 0 })
      setMyPoints(prev => prev - amount)
      setBetTotals(prev => ({ ...prev, [betTarget]: (prev[betTarget] ?? 0) + amount }))
    } finally {
      setPlacingBet(false)
    }
  }

  const handlePlaceRoundBet = async () => {
    if (!roundBetTarget || placingRoundBet || myRoundBet || !betRound) return
    const amount = parseInt(roundBetAmount, 10)
    if (isNaN(amount) || amount < 10 || amount > 1000) {
      setRoundBetError('El monto debe estar entre 10 y 1000 pts')
      return
    }
    if (amount > myPoints) {
      setRoundBetError('Puntos insuficientes')
      return
    }
    setRoundBetError(null)
    setPlacingRoundBet(true)
    try {
      const { data, error } = await (supabase as any).rpc('place_bet', {
        p_match_id: match.id,
        p_bet_on: roundBetTarget,
        p_amount: amount,
      })
      if (error || data?.error) {
        const code = data?.error ?? error?.message
        const msgs: Record<string, string> = {
          betting_window_closed: 'La ronda de apuestas ya cerró',
          already_bet: 'Ya apostaste en esta ronda',
          insufficient_points: 'Puntos insuficientes',
          invalid_amount: 'Monto inválido (10–1000)',
          invalid_bet_target: 'Jugador inválido',
          not_authenticated: 'Debes iniciar sesión',
          players_cannot_bet: 'Los jugadores no pueden apostar en su propia partida',
        }
        setRoundBetError(msgs[code] ?? 'Error al apostar')
        return
      }
      setMyRoundBet({ bet_on: roundBetTarget, amount, status: 'open', payout: 0, round_id: betRound.id })
      setMyPoints(prev => prev - amount)
      setRoundBetTotals(prev => ({ ...prev, [roundBetTarget]: (prev[roundBetTarget] ?? 0) + amount }))
    } finally {
      setPlacingRoundBet(false)
    }
  }

  const bettingOpen = !!match.betting_closes_at && bettingSecondsLeft > 0
  const roundBettingOpen = !!betRound && roundSecondsLeft > 0

  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0)
  const p1Votes = voteCounts[match.player1_id] ?? 0
  const p2Votes = voteCounts[match.player2_id] ?? 0
  const p1Pct = totalVotes > 0 ? Math.round((p1Votes / totalVotes) * 100) : 50
  const p2Pct = totalVotes > 0 ? 100 - p1Pct : 50

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const p1Profile = player1?.profiles
  const p2Profile = player2?.profiles
  const p1Name = p1Profile?.display_name || p1Profile?.username || 'J1'
  const p2Name = p2Profile?.display_name || p2Profile?.username || 'J2'
  const p1WR = p1Profile && (p1Profile.wins + p1Profile.losses) > 0 ? Math.round(p1Profile.wins / (p1Profile.wins + p1Profile.losses) * 100) : 0
  const p2WR = p2Profile && (p2Profile.wins + p2Profile.losses) > 0 ? Math.round(p2Profile.wins / (p2Profile.wins + p2Profile.losses) * 100) : 0

  const p1Sponsor = sponsors.find(s => s.player_id === match.player1_id)
  const p2Sponsor = sponsors.find(s => s.player_id === match.player2_id)

  const isCompleted = match.status === 'completed' || match.status === 'disputed'
  const winnerId = match.winner_id
  const myVoteWon = winnerId && myVote === winnerId

  return (
    <div className="space-y-5">
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            <span className="text-[#888] text-xs font-medium uppercase tracking-wider">En vivo</span>
          </div>
          <h1 className="text-white font-black text-lg leading-tight truncate">
            {p1Name} <span className="text-[#555]">vs</span> {p2Name}
          </h1>
          <p className="text-[#555] text-xs mt-0.5">{tournament.game_mode} · {tournament.title}</p>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-center">
            <div className="text-[#8b5cf6] font-black text-xl leading-none">${tournament.prize_pool}</div>
            <div className="text-[#555] text-[10px]">MXN</div>
          </div>
          <div className="text-center bg-[#08071a] rounded-lg px-3 py-2 border border-[#272454]">
            <div className="text-white font-mono font-bold text-base leading-none">{formatTime(elapsed)}</div>
            <div className="text-[#555] text-[10px] flex items-center gap-1 justify-center mt-0.5"><Clock size={8} />Tiempo</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-base leading-none flex items-center gap-1"><Eye size={13} className="text-[#8b5cf6]" />{match.spectator_count ?? 0}</div>
            <div className="text-[#555] text-[10px]">viendo</div>
          </div>
        </div>
      </div>

      {/* ── Stream / Arena ───────────────────────────────────────────────── */}
      {tournament.stream_url
        ? <StreamEmbed url={tournament.stream_url} />
        : <MatchArena
            p1Name={p1Name}
            p2Name={p2Name}
            p1EpicUsername={player1?.epic_username ?? null}
            p2EpicUsername={player2?.epic_username ?? null}
            p1Profile={p1Profile ?? null}
            p2Profile={p2Profile ?? null}
            p1WR={p1WR}
            p2WR={p2WR}
            prizePool={tournament.prize_pool}
            gameMode={tournament.game_mode}
            elapsed={elapsed}
            formatTime={formatTime}
          />
      }

      {/* ── Ronda extra de apuestas ─────────────────────────────────────── */}
      {showNewRoundBanner && betRound && (
        <div className="new-round-banner relative overflow-hidden bg-[#111] border-2 border-[#e85d24] rounded-2xl px-5 py-4 flex items-center justify-center gap-3">
          <style>{`
            @keyframes new-round-pop {
              0%   { transform: scale(0.5) translateY(-12px); opacity: 0; }
              55%  { transform: scale(1.07) translateY(0); opacity: 1; }
              100% { transform: scale(1) translateY(0); opacity: 1; }
            }
            @keyframes new-round-glow {
              0%, 100% { box-shadow: 0 0 18px rgba(232,93,36,0.35); }
              50%      { box-shadow: 0 0 48px rgba(232,93,36,0.8); }
            }
            @keyframes new-round-shine {
              0%   { transform: translateX(-120%) skewX(-15deg); }
              100% { transform: translateX(320%) skewX(-15deg); }
            }
            .new-round-banner { animation: new-round-pop 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both, new-round-glow 1.4s ease-in-out infinite 0.5s; }
            .new-round-shine  { animation: new-round-shine 1.6s ease-in-out infinite 0.4s; }
          `}</style>
          <div className="new-round-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#e85d24]/20 to-transparent pointer-events-none" />
          <TrendingUp size={20} className="text-[#e85d24] flex-shrink-0" />
          <p className="text-center">
            <span className="text-[#e85d24] font-black text-lg tracking-wide">¡NUEVA RONDA DE APUESTAS!</span>
            <span className="block text-[#888] text-xs mt-0.5">Ronda #{betRound.round_number} · {roundSecondsLeft}s para apostar</span>
          </p>
          <Coins size={20} className="text-[#e85d24] flex-shrink-0" />
        </div>
      )}

      {roundBettingOpen && !isCompleted && betRound && (
        <BettingPanel
          match={match}
          title={`Ronda #${betRound.round_number} · Apuestas en vivo`}
          p1Name={p1Name}
          p2Name={p2Name}
          player1Id={match.player1_id}
          player2Id={match.player2_id}
          bettingOpen={roundBettingOpen}
          bettingSecondsLeft={roundSecondsLeft}
          betTotals={roundBetTotals}
          myBet={myRoundBet}
          myPoints={myPoints}
          betTarget={roundBetTarget}
          setBetTarget={setRoundBetTarget}
          betAmount={roundBetAmount}
          setBetAmount={setRoundBetAmount}
          betError={roundBetError}
          placingBet={placingRoundBet}
          onPlaceBet={handlePlaceRoundBet}
        />
      )}

      {/* ── Betting panel ───────────────────────────────────────────────── */}
      {match.betting_closes_at && (
        <BettingPanel
          match={match}
          p1Name={p1Name}
          p2Name={p2Name}
          player1Id={match.player1_id}
          player2Id={match.player2_id}
          bettingOpen={bettingOpen}
          bettingSecondsLeft={bettingSecondsLeft}
          betTotals={betTotals}
          myBet={myBet}
          myPoints={myPoints}
          betTarget={betTarget}
          setBetTarget={setBetTarget}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          betError={betError}
          placingBet={placingBet}
          onPlaceBet={handlePlaceBet}
        />
      )}

      {/* ── Prediction won banner ────────────────────────────────────────── */}
      {isCompleted && myVoteWon && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-400/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Crown size={18} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-yellow-400 font-black">¡Predicción correcta!</p>
            <p className="text-[#888] text-sm">+50 puntos añadidos a tu perfil</p>
          </div>
        </div>
      )}

      {/* ── Match completed ──────────────────────────────────────────────── */}
      {isCompleted && winnerId && (
        <div className="bg-[#0f0e2a] border border-[#8b5cf6]/30 rounded-2xl p-5 text-center">
          <Crown size={28} className="text-yellow-400 mx-auto mb-2" />
          <p className="text-[#888] text-xs mb-1">
            {match.status === 'disputed' ? 'Resultado en disputa' : 'Ganador'}
          </p>
          <p className="text-white font-black text-xl">
            {winnerId === match.player1_id ? p1Name : p2Name}
          </p>
        </div>
      )}

      {/* ── Mis apuestas (toggle) ────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowMyBets(v => !v)}
          className="w-full flex items-center justify-between bg-[#111] border border-[#e85d24]/20 hover:border-[#e85d24]/40 rounded-2xl px-5 py-3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#e85d24]/10 rounded-lg flex items-center justify-center">
              <Coins size={12} className="text-[#e85d24]" />
            </div>
            <span className="text-white font-bold text-sm">Mis apuestas</span>
          </div>
          <ChevronDown
            size={14}
            className={`text-[#555] transition-transform duration-200 ${showMyBets ? 'rotate-180' : ''}`}
          />
        </button>
        {showMyBets && (
          <div className="mt-2">
            <MisApuestas />
          </div>
        )}
      </div>

      {/* ── Two columns: Voting | Chat ───────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Left 2/3: Voting cards */}
        <div className="lg:col-span-2 space-y-4">

          {/* Vote header */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <Trophy size={14} className="text-[#8b5cf6]" />
              {myVote ? 'Tu predicción' : 'Predice quién gana · +50 pts si aciertas'}
            </h2>
            <span className="text-[#555] text-xs">{totalVotes} votos</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Player 1 */}
            <button
              onClick={() => handleVote(match.player1_id)}
              disabled={!!myVote || isCompleted || isPending}
              className={`relative text-left rounded-2xl border p-5 transition-all ${
                myVote === match.player1_id
                  ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 shadow-[0_0_24px_rgba(139,92,246,0.15)]'
                  : winnerId === match.player1_id
                  ? 'border-yellow-400/40 bg-yellow-400/5'
                  : myVote
                  ? 'border-[#272454] bg-[#0f0e2a] opacity-60'
                  : 'border-[#272454] bg-[#0f0e2a] hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/5 cursor-pointer'
              }`}
            >
              {p1Sponsor && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
                  <Star size={7} />PATROCINADO
                </div>
              )}
              {winnerId === match.player1_id && (
                <div className="absolute top-2 left-2">
                  <Crown size={14} className="text-yellow-400" />
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl mb-2 ${
                  myVote === match.player1_id ? 'bg-[#8b5cf6]' : 'bg-[#2d2960]'
                }`}>
                  {p1Name[0]?.toUpperCase()}
                </div>
                <p className="text-white font-bold text-sm">{p1Name}</p>
                {player1?.epic_username && (
                  <p className="text-[#8b5cf6] text-xs font-mono mt-0.5">{player1.epic_username}</p>
                )}
                <div className="flex gap-3 mt-2 text-center">
                  <div><p className="text-white text-xs font-bold">{p1Profile?.wins ?? 0}</p><p className="text-[#555] text-[10px]">W</p></div>
                  <div><p className="text-[#8b5cf6] text-xs font-bold">{p1WR}%</p><p className="text-[#555] text-[10px]">WR</p></div>
                </div>
                {p1Sponsor && (
                  <p className="text-[#555] text-[10px] mt-1">
                    Sponsor: {p1Sponsor.profiles?.display_name || p1Sponsor.profiles?.username}
                  </p>
                )}
              </div>

              {/* Vote bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#888]">{p1Votes} votos</span>
                  <span className={`font-bold ${myVote === match.player1_id ? 'text-[#8b5cf6]' : 'text-[#555]'}`}>{p1Pct}%</span>
                </div>
                <div className="h-1.5 bg-[#272454] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8b5cf6] rounded-full transition-all duration-700"
                    style={{ width: `${p1Pct}%` }}
                  />
                </div>
              </div>
            </button>

            {/* Player 2 */}
            <button
              onClick={() => handleVote(match.player2_id)}
              disabled={!!myVote || isCompleted || isPending}
              className={`relative text-left rounded-2xl border p-5 transition-all ${
                myVote === match.player2_id
                  ? 'border-[#3b82f6] bg-[#3b82f6]/10 shadow-[0_0_24px_rgba(59,130,246,0.15)]'
                  : winnerId === match.player2_id
                  ? 'border-yellow-400/40 bg-yellow-400/5'
                  : myVote
                  ? 'border-[#272454] bg-[#0f0e2a] opacity-60'
                  : 'border-[#272454] bg-[#0f0e2a] hover:border-[#3b82f6]/40 hover:bg-[#3b82f6]/5 cursor-pointer'
              }`}
            >
              {p2Sponsor && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
                  <Star size={7} />PATROCINADO
                </div>
              )}
              {winnerId === match.player2_id && (
                <div className="absolute top-2 left-2">
                  <Crown size={14} className="text-yellow-400" />
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl mb-2 ${
                  myVote === match.player2_id ? 'bg-[#3b82f6]' : 'bg-[#1e2a4a]'
                }`}>
                  {p2Name[0]?.toUpperCase()}
                </div>
                <p className="text-white font-bold text-sm">{p2Name}</p>
                {player2?.epic_username && (
                  <p className="text-[#3b82f6] text-xs font-mono mt-0.5">{player2.epic_username}</p>
                )}
                <div className="flex gap-3 mt-2 text-center">
                  <div><p className="text-white text-xs font-bold">{p2Profile?.wins ?? 0}</p><p className="text-[#555] text-[10px]">W</p></div>
                  <div><p className="text-[#3b82f6] text-xs font-bold">{p2WR}%</p><p className="text-[#555] text-[10px]">WR</p></div>
                </div>
                {p2Sponsor && (
                  <p className="text-[#555] text-[10px] mt-1">
                    Sponsor: {p2Sponsor.profiles?.display_name || p2Sponsor.profiles?.username}
                  </p>
                )}
              </div>

              {/* Vote bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#888]">{p2Votes} votos</span>
                  <span className={`font-bold ${myVote === match.player2_id ? 'text-[#3b82f6]' : 'text-[#555]'}`}>{p2Pct}%</span>
                </div>
                <div className="h-1.5 bg-[#272454] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3b82f6] rounded-full transition-all duration-700"
                    style={{ width: `${p2Pct}%` }}
                  />
                </div>
              </div>
            </button>
          </div>

          {/* Points info */}
          <div className="bg-[#08071a] border border-[#1e1b4b] rounded-xl px-4 py-3 flex items-center gap-3">
            <Star size={14} className="text-[#8b5cf6] flex-shrink-0" />
            <p className="text-[#555] text-xs">
              <span className="text-white">+10 pts</span> por ver la partida completa ·{' '}
              <span className="text-yellow-400">+50 pts</span> si aciertas la predicción
            </p>
          </div>
        </div>

        {/* Right 1/3: Chat */}
        <div className="lg:col-span-1 flex flex-col bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl overflow-hidden" style={{ minHeight: '420px', maxHeight: '560px' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1b4b] flex-shrink-0">
            <MessageCircle size={14} className="text-[#8b5cf6]" />
            <span className="text-white font-bold text-sm">Chat en vivo</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
            {messages.length === 0 && (
              <p className="text-[#555] text-xs text-center py-8">Sé el primero en escribir</p>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.user_id === userId ? 'flex-row-reverse' : ''}`}>
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#272454] flex items-center justify-center text-white text-[10px] font-bold">
                  {msg.profiles?.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className={`max-w-[75%] ${msg.user_id === userId ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    {msg.profiles?.is_vip && (
                      <Crown size={9} className="text-yellow-400" />
                    )}
                    <span className="text-[#555] text-[10px]">{msg.profiles?.username ?? 'Anon'}</span>
                  </div>
                  <div className={`text-sm px-3 py-1.5 rounded-xl break-words ${
                    msg.user_id === userId
                      ? 'bg-[#8b5cf6]/20 text-white rounded-tr-none'
                      : 'bg-[#08071a] text-[#ccc] rounded-tl-none border border-[#272454]'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="px-3 pb-3 pt-2 border-t border-[#1e1b4b] flex-shrink-0">
            {chatError && (
              <p className="text-red-400 text-[10px] mb-1.5">{chatError}</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value.slice(0, 200))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                placeholder="Escribe un mensaje..."
                maxLength={200}
                className="flex-1 bg-[#08071a] border border-[#272454] focus:border-[#8b5cf6] rounded-lg px-3 py-2 text-white placeholder-[#444] outline-none text-sm transition-colors"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || sendingChat}
                className="w-9 h-9 bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
              >
                <Send size={14} className="text-white" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
