import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import SpectateRoom from './SpectateRoom'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function SpectatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Fetch match with tournament info
  const { data: matchRaw } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single()

  if (!matchRaw) notFound()
  const match = matchRaw as any

  const [
    { data: tournamentRaw },
    { data: participantsRaw },
    { data: mySessionRaw },
    { data: voteSessionsRaw },
    { data: messagesRaw },
    { data: sponsorsRaw },
    { data: betsRaw },
    { data: myBetsRaw },
    { data: myProfileRaw },
    { data: activeRoundRaw },
  ] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', match.tournament_id).single(),
    supabase
      .from('tournament_participants')
      .select('*, profiles(username, display_name, wins, losses, points, is_vip, frame_tier)')
      .eq('tournament_id', match.tournament_id)
      .order('joined_at'),
    (supabase as any)
      .from('spectator_sessions')
      .select('voted_for, points_earned, left_at')
      .eq('match_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    (supabase as any)
      .from('spectator_sessions')
      .select('voted_for')
      .eq('match_id', id)
      .not('voted_for', 'is', null),
    (supabase as any)
      .from('spectator_chat_messages')
      .select('id, user_id, content, created_at, profiles(username, is_vip)')
      .eq('match_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    (supabase as any)
      .from('sponsors')
      .select('player_id, sponsor_id, amount, status, profiles!sponsors_sponsor_id_fkey(username, display_name)')
      .eq('tournament_id', match.tournament_id)
      .eq('status', 'active'),
    (supabase as any)
      .from('match_bets')
      .select('bet_on, amount, status, round_id')
      .eq('match_id', id),
    (supabase as any)
      .from('match_bets')
      .select('bet_on, amount, status, payout, round_id')
      .eq('match_id', id)
      .eq('user_id', user.id),
    supabase.from('profiles').select('points').eq('id', user.id).single(),
    (supabase as any)
      .from('bet_rounds')
      .select('id, round_number, closes_at')
      .eq('match_id', id)
      .gt('closes_at', new Date().toISOString())
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!tournamentRaw) notFound()

  const tournament = tournamentRaw as any
  const participants = (participantsRaw ?? []) as any[]
  const mySession = mySessionRaw as any
  const voteSessionsList = (voteSessionsRaw ?? []) as any[]
  const messages = ((messagesRaw ?? []) as any[]).reverse()
  const sponsors = (sponsorsRaw ?? []) as any[]
  const allBets = (betsRaw ?? []) as any[]
  const myBets = (myBetsRaw ?? []) as any[]
  const myPoints = (myProfileRaw as any)?.points ?? 0
  const activeRound = (activeRoundRaw as any) ?? null

  const myBet = myBets.find(b => !b.round_id) ?? null
  const myRoundBet = activeRound ? (myBets.find(b => b.round_id === activeRound.id) ?? null) : null

  // Compute vote counts
  const voteCounts: Record<string, number> = {}
  for (const s of voteSessionsList) {
    if (s.voted_for) voteCounts[s.voted_for] = (voteCounts[s.voted_for] ?? 0) + 1
  }

  // Compute bet totals per player — separate pots: initial window (round_id null) vs active round
  const initialBetTotals: Record<string, number> = {}
  const initialRoundBetTotals: Record<string, number> = {}
  for (const b of allBets) {
    if (b.status !== 'open') continue
    if (!b.round_id) {
      initialBetTotals[b.bet_on] = (initialBetTotals[b.bet_on] ?? 0) + b.amount
    } else if (activeRound && b.round_id === activeRound.id) {
      initialRoundBetTotals[b.bet_on] = (initialRoundBetTotals[b.bet_on] ?? 0) + b.amount
    }
  }

  const player1 = participants.find((p: any) => p.player_id === match.player1_id) ?? null
  const player2 = participants.find((p: any) => p.player_id === match.player2_id) ?? null

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <Link href={`/tournaments/${match.tournament_id}`} className="inline-flex items-center gap-1.5 text-[#888] hover:text-white text-sm transition-colors mb-5">
          <ChevronLeft size={16} />
          Volver al torneo
        </Link>

        <SpectateRoom
          match={match}
          tournament={tournament}
          player1={player1}
          player2={player2}
          userId={user.id}
          mySession={mySession}
          initialVoteCounts={voteCounts}
          initialMessages={messages}
          sponsors={sponsors}
          initialBetTotals={initialBetTotals}
          myBet={myBet}
          myPoints={myPoints}
          activeRound={activeRound}
          initialRoundBetTotals={initialRoundBetTotals}
          myRoundBet={myRoundBet}
        />
      </main>
    </div>
  )
}
