'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, Send, Crown, Star, Clock, Trophy, MessageCircle } from 'lucide-react'

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

  const chatEndRef = useRef<HTMLDivElement>(null)
  const hasLeft = useRef(false)

  // Timer
  useEffect(() => {
    const startTime = new Date(match.created_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [match.created_at])

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

      {/* ── Stream embed ─────────────────────────────────────────────────── */}
      {tournament.stream_url && <StreamEmbed url={tournament.stream_url} />}

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
