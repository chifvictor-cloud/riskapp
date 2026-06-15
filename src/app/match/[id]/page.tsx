import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import MatchRoom from './MatchRoom'
import Link from 'next/link'
import { ChevronLeft, Swords } from 'lucide-react'
import type { Database } from '@/types/database'

type Match = Database['public']['Tables']['matches']['Row']
type Tournament = Database['public']['Tables']['tournaments']['Row']

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: matchRaw } = await supabase.from('matches').select('*').eq('id', id).single()
  const match = matchRaw as Match | null
  if (!match) notFound()

  const [{ data: tournamentRaw }, { data: participantsRaw }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', match.tournament_id).single(),
    supabase
      .from('tournament_participants')
      .select('player_id, epic_username, profiles(id, username, display_name)')
      .eq('tournament_id', match.tournament_id)
      .order('joined_at'),
  ])

  const tournament = tournamentRaw as Tournament | null
  if (!tournament) notFound()

  const participants = (participantsRaw ?? []) as any[]
  const player1 = participants.find((p: any) => p.player_id === match.player1_id) ?? {
    player_id: match.player1_id,
    epic_username: null,
    profiles: null,
  }
  const player2 = participants.find((p: any) => p.player_id === match.player2_id) ?? {
    player_id: match.player2_id,
    epic_username: null,
    profiles: null,
  }

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-24 pb-16">
        <Link href={`/tournaments/${match.tournament_id}`} className="inline-flex items-center gap-1.5 text-[#888] hover:text-white text-sm transition-colors mb-6">
          <ChevronLeft size={16} />
          Volver al torneo
        </Link>

        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-[#8b5cf6]/10 rounded-lg flex items-center justify-center">
            <Swords size={16} className="text-[#8b5cf6]" />
          </div>
          <div>
            <p className="text-[#8b5cf6] text-xs font-bold uppercase tracking-widest">Sala de partida</p>
            <p className="text-[#555] text-xs font-mono">{id.slice(0, 8)}…</p>
          </div>
        </div>

        <MatchRoom
          match={match}
          tournament={tournament}
          player1={player1}
          player2={player2}
          userId={user.id}
        />
      </main>
    </div>
  )
}
