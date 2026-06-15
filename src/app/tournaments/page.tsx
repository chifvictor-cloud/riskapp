import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import TournamentList from '@/components/TournamentList'
import type { Database } from '@/types/database'

type Tournament = Database['public']['Tables']['tournaments']['Row']

const FORMAT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'No Build', label: 'No Build' },
  { value: 'Construcción', label: 'Construcción' },
  { value: 'Zero Build', label: 'Zero Build' },
]

const FEE_OPTIONS = [
  { value: '', label: 'Cualquier entrada' },
  { value: 'low', label: '$20–$100' },
  { value: 'mid', label: '$100–$500' },
  { value: 'high', label: '$500+' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Activos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Completados' },
]

function buildHref(current: Record<string, string>, key: string, val: string) {
  const p = new URLSearchParams({ ...current, [key]: val })
  if (!val) p.delete(key)
  const str = p.toString()
  return `/tournaments${str ? `?${str}` : ''}`
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; fee?: string; status?: string; create?: string }>
}) {
  const params = await searchParams
  const { format = '', fee = '', status = '', create = '' } = params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Initial server-side fetch
  let query = supabase.from('tournaments').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  else query = query.in('status', ['open', 'in_progress'])
  if (format) query = query.eq('game_mode', format)
  if (fee === 'low') query = query.gte('entry_fee', 20).lte('entry_fee', 100)
  else if (fee === 'mid') query = query.gt('entry_fee', 100).lte('entry_fee', 500)
  else if (fee === 'high') query = query.gt('entry_fee', 500)

  const [
    { data: tournamentsRaw },
    { count: openCount },
    profileRaw,
  ] = await Promise.all([
    query.limit(30),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    user ? supabase.from('profiles').select('fortnite_username').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const tournaments = (tournamentsRaw ?? []) as Tournament[]
  const userEpicUsername = (profileRaw.data as any)?.fortnite_username ?? null
  const currentParams = { format, fee, status }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[#7c3aed] text-xs font-bold uppercase tracking-widest mb-1">Competencias</p>
          <h1 className="text-4xl sm:text-5xl font-black text-white leading-none">Torneos 1v1</h1>
          <p className="text-[#888] mt-2 text-sm">
            {openCount ?? 0} torneo{openCount !== 1 ? 's' : ''} abierto{openCount !== 1 ? 's' : ''} ahora mismo
          </p>
        </div>

        {/* Filters (server-rendered links, no JS needed) */}
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-4 mb-8 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#444] text-xs font-medium w-14 flex-shrink-0">Estado</span>
            {STATUS_OPTIONS.map(opt => (
              <a key={opt.value} href={buildHref(currentParams, 'status', opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${status === opt.value ? 'bg-[#7c3aed] text-white' : 'bg-[#111] border border-[#222] text-[#888] hover:text-white hover:border-[#333]'}`}>
                {opt.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#444] text-xs font-medium w-14 flex-shrink-0">Formato</span>
            {FORMAT_OPTIONS.map(opt => (
              <a key={opt.value} href={buildHref(currentParams, 'format', opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${format === opt.value ? 'bg-white/10 text-white border border-white/20' : 'bg-[#111] border border-[#222] text-[#888] hover:text-white hover:border-[#333]'}`}>
                {opt.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#444] text-xs font-medium w-14 flex-shrink-0">Entrada</span>
            {FEE_OPTIONS.map(opt => (
              <a key={opt.value} href={buildHref(currentParams, 'fee', opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${fee === opt.value ? 'bg-white/10 text-white border border-white/20' : 'bg-[#111] border border-[#222] text-[#888] hover:text-white hover:border-[#333]'}`}>
                {opt.label}
              </a>
            ))}
          </div>
        </div>

        {/* Realtime list (client component) */}
        <TournamentList
          initialTournaments={tournaments}
          format={format}
          fee={fee}
          status={status}
          userId={user?.id ?? null}
          userEpicUsername={userEpicUsername}
          openCreate={create === '1'}
        />
      </main>
    </div>
  )
}
