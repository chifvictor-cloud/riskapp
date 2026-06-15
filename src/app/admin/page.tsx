import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import AdminPanel from './AdminPanel'
import { ShieldCheck } from 'lucide-react'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as { is_admin: boolean } | null
  if (!profile?.is_admin) redirect('/')

  // Stats: today's window
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [
    { data: disputedRaw },
    { data: activeRaw },
    { data: usersRaw },
    { count: totalUsers },
    { count: tournamentsToday },
    { data: completedTodayRaw },
    { count: disputesCount },
  ] = await Promise.all([
    // Disputed matches
    supabase
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
      .order('created_at'),

    // Active in-progress matches
    supabase
      .from('matches')
      .select(`
        id, tournament_id, player1_id, player2_id, status, created_at,
        player1_claimed_winner, player2_claimed_winner,
        tournament:tournaments(title, prize_pool, game_mode),
        player1:profiles!matches_player1_id_fkey(id, username, display_name),
        player2:profiles!matches_player2_id_fkey(id, username, display_name)
      `)
      .eq('status', 'in_progress')
      .order('created_at'),

    // Users list
    supabase
      .from('profiles')
      .select('id, username, display_name, balance, wins, losses, is_admin, created_at')
      .order('balance', { ascending: false })
      .limit(100),

    // Total registered users
    supabase.from('profiles').select('*', { count: 'exact', head: true }),

    // Tournaments created today
    supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    // Completed today → revenue
    supabase
      .from('tournaments')
      .select('prize_pool')
      .eq('status', 'completed')
      .gte('updated_at', todayISO),

    // Disputed matches count
    supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'disputed'),
  ])

  // Enrich disputes with Epic usernames from tournament_participants
  const disputes = (disputedRaw ?? []) as any[]
  const activeMatches = (activeRaw ?? []) as any[]
  const users = (usersRaw ?? []) as any[]

  const disputeTournamentIds = disputes.map((d: any) => d.tournament_id).filter(Boolean)
  let participantMap: Record<string, Record<string, string | null>> = {}

  if (disputeTournamentIds.length > 0) {
    const { data: pRaw } = await supabase
      .from('tournament_participants')
      .select('tournament_id, player_id, epic_username')
      .in('tournament_id', disputeTournamentIds)
    for (const p of (pRaw ?? []) as any[]) {
      if (!participantMap[p.tournament_id]) participantMap[p.tournament_id] = {}
      participantMap[p.tournament_id][p.player_id] = p.epic_username
    }
  }

  const enrichedDisputes = disputes.map((d: any) => ({
    ...d,
    player1_epic: participantMap[d.tournament_id]?.[d.player1_id] ?? null,
    player2_epic: participantMap[d.tournament_id]?.[d.player2_id] ?? null,
  }))

  const completedToday = (completedTodayRaw ?? []) as any[]
  const revenueToday = completedToday.reduce((sum: number, t: any) => sum + (t.prize_pool ?? 0) * 0.1, 0)

  const stats = {
    tournamentsToday: tournamentsToday ?? 0,
    revenueToday,
    disputesCount: disputesCount ?? 0,
    totalUsers: totalUsers ?? 0,
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-[#7c3aed]/10 rounded-xl flex items-center justify-center">
            <ShieldCheck size={20} className="text-[#7c3aed]" />
          </div>
          <div>
            <p className="text-[#7c3aed] text-xs font-bold uppercase tracking-widest mb-0.5">Solo administradores</p>
            <h1 className="text-3xl font-black text-white leading-none">Panel de Admin</h1>
          </div>
        </div>

        <AdminPanel
          stats={stats}
          initialDisputes={enrichedDisputes}
          initialActiveMatches={activeMatches}
          users={users}
        />
      </main>
    </div>
  )
}
