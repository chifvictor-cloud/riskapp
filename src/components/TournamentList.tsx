'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TournamentCard from './TournamentCard'
import CreateTournamentModal from './CreateTournamentModal'
import { Plus, Search, Wifi } from 'lucide-react'
import type { Database } from '@/types/database'

type Tournament = Database['public']['Tables']['tournaments']['Row']

interface Props {
  initialTournaments: Tournament[]
  format: string
  fee: string
  status: string
  userId: string | null
  userEpicUsername: string | null
  openCreate?: boolean
}

export default function TournamentList({ initialTournaments, format, fee, status, userId, userEpicUsername, openCreate }: Props) {
  const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments)
  const [showModal, setShowModal] = useState(false)
  const [liveIndicator, setLiveIndicator] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const router = useRouter()

  // Track known IDs via ref to avoid stale closure in realtime callback
  const knownIds = useRef<Set<string>>(new Set(initialTournaments.map(t => t.id)))
  const isFirstRender = useRef(true)

  // Auto-open modal when coming from dashboard "Crear torneo" button
  useEffect(() => {
    if (openCreate && userId) {
      setShowModal(true)
      // Clean the ?create=1 param without triggering a server re-render
      router.replace('/tournaments', { scroll: false })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTournaments = async () => {
    let query = supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    else query = query.in('status', ['open', 'in_progress'])

    if (format) query = query.eq('game_mode', format)
    if (fee === 'low') query = query.gte('entry_fee', 20).lte('entry_fee', 100)
    else if (fee === 'mid') query = query.gt('entry_fee', 100).lte('entry_fee', 500)
    else if (fee === 'high') query = query.gt('entry_fee', 500)

    const { data } = await query.limit(30)
    if (!data) return

    // Sort: live (in_progress + is_creator) first, then in_progress, then open
    const newList = [...data as Tournament[]].sort((a, b) => {
      const rank = (t: Tournament) => {
        if (t.status === 'in_progress' && (t as any).is_creator) return 0
        if (t.status === 'in_progress') return 1
        if (t.status === 'open') return 2
        return 3
      }
      return rank(a) - rank(b)
    })

    if (!isFirstRender.current) {
      const added = newList.filter(t => !knownIds.current.has(t.id)).map(t => t.id)
      if (added.length > 0) {
        setNewIds(new Set(added))
        setTimeout(() => setNewIds(new Set()), 2000)
      }
    }
    isFirstRender.current = false
    newList.forEach(t => knownIds.current.add(t.id))

    setTournaments(newList)
    setLiveIndicator(true)
    setTimeout(() => setLiveIndicator(false), 800)
  }

  useEffect(() => {
    const channel = supabase
      .channel('tournaments-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => {
        fetchTournaments()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [format, fee, status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {showModal && (
        <CreateTournamentModal
          onClose={() => setShowModal(false)}
          defaultEpicUsername={userEpicUsername}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${liveIndicator ? 'bg-green-400' : 'bg-green-400/40'}`} />
          <span className="text-[#888] text-xs font-medium">En tiempo real</span>
          <Wifi size={12} className="text-[#555]" />
        </div>
        {userId && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-4 py-2 rounded-xl transition-colors text-sm shadow-[0_0_16px_rgba(139,92,246,0.2)]"
          >
            <Plus size={15} />
            Crear torneo
          </button>
        )}
      </div>

      {/* Grid */}
      {tournaments.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map(t => (
            <div
              key={t.id}
              className={`transition-all duration-500 ${newIds.has(t.id) ? 'scale-[1.02] ring-2 ring-[#8b5cf6]/40 rounded-xl' : ''}`}
            >
              <TournamentCard tournament={t} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-28">
          <div className="w-16 h-16 bg-[#0d0c26] border border-[#201e50] rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Search size={24} className="text-[#3a375e]" />
          </div>
          <h3 className="text-white font-bold text-xl mb-2">Sin torneos activos</h3>
          <p className="text-[#888] text-sm mb-6">Sé el primero en crear uno</p>
          {userId && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              <Plus size={16} />
              Crear torneo
            </button>
          )}
          {!userId && (
            <a href="/auth/login" className="inline-block bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-6 py-3 rounded-xl transition-colors">
              Iniciar sesión para crear
            </a>
          )}
        </div>
      )}
    </>
  )
}
