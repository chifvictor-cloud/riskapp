import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import TournamentDetail from './TournamentDetail'
import Link from 'next/link'
import { ChevronLeft, DollarSign, Swords, Calendar, Eye } from 'lucide-react'
import type { Database } from '@/types/database'

type Tournament = Database['public']['Tables']['tournaments']['Row']
type Match = Database['public']['Tables']['matches']['Row']

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: tournamentRaw },
    { data: participantsRaw },
    { data: matchRaw },
  ] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase
      .from('tournament_participants')
      .select('*, profiles(username, display_name, wins, losses, points)')
      .eq('tournament_id', id)
      .order('joined_at'),
    supabase.from('matches').select('*').eq('tournament_id', id).maybeSingle(),
  ])

  const tournament = tournamentRaw as Tournament | null
  const participants = (participantsRaw ?? []) as any[]
  const match = matchRaw as Match | null

  if (!tournament) notFound()

  // Fetch sponsor data for this tournament
  const { data: sponsorRaw } = await (supabase as any)
    .from('sponsors')
    .select('player_id, sponsor_id, amount, status, profiles!sponsors_sponsor_id_fkey(username, display_name)')
    .eq('tournament_id', id)
    .eq('status', 'active')
    .limit(2)

  const sponsors = (sponsorRaw ?? []) as any[]

  let userEpicUsername: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('fortnite_username')
      .eq('id', user.id)
      .single()
    userEpicUsername = (profile as any)?.fortnite_username ?? null
    const myParticipant = participants.find((p: any) => p.player_id === user.id)
    if (myParticipant?.epic_username) userEpicUsername = myParticipant.epic_username
  }

  const createdAt = new Date(tournament.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[#08071a]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link href="/tournaments" className="inline-flex items-center gap-1.5 text-[#888] hover:text-white text-sm transition-colors mb-6">
          <ChevronLeft size={16} />
          Todos los torneos
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: static info */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-[#0f0e2a] border border-[#201e50] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2 mb-4">
                <h1 className="text-white font-black text-xl leading-tight">{tournament.title}</h1>
                {tournament.is_creator && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-black text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                    EN VIVO
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#888] text-sm"><Swords size={13} />Formato</div>
                  <span className="text-white text-sm font-semibold">{tournament.game_mode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#888] text-sm"><DollarSign size={13} />Entrada</div>
                  <span className="text-white text-sm font-semibold">${tournament.entry_fee} MXN</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#1e1b4b] pt-3">
                  <div className="flex items-center gap-2 text-[#888] text-sm"><DollarSign size={13} />Premio</div>
                  <span className="text-[#8b5cf6] font-black">${tournament.prize_pool} MXN</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#888] text-sm"><Calendar size={13} />Creado</div>
                  <span className="text-white text-xs">{createdAt}</span>
                </div>
                {match && match.spectator_count > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#888] text-sm"><Eye size={13} />Espectadores</div>
                    <span className="text-[#8b5cf6] font-bold text-sm">{match.spectator_count}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Ver en vivo button */}
            {match && match.status === 'in_progress' && (
              <Link
                href={`/match/${match.id}/spectate`}
                className="flex items-center justify-center gap-2 w-full bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 text-[#8b5cf6] font-bold py-3 rounded-xl transition-all text-sm"
              >
                <Eye size={15} />
                Ver en vivo
                {match.spectator_count > 0 && (
                  <span className="text-[#8b5cf6]/60 text-xs">({match.spectator_count})</span>
                )}
              </Link>
            )}

            {tournament.rules && (
              <div className="bg-[#0f0e2a] border border-[#201e50] rounded-2xl p-5">
                <h3 className="text-white font-bold mb-2 text-sm">Reglas</h3>
                <p className="text-[#888] text-sm leading-relaxed">{tournament.rules}</p>
              </div>
            )}
          </div>

          {/* Right: interactive */}
          <div className="lg:col-span-2">
            <TournamentDetail
              tournament={tournament}
              participants={participants}
              match={match}
              userId={user?.id ?? null}
              userEpicUsername={userEpicUsername}
              sponsors={sponsors}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
