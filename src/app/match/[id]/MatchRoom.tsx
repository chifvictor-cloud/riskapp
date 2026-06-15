'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { submitMatchResult } from './actions'
import {
  Clock, Trophy, AlertCircle, Upload, CheckCircle2,
  Hourglass, ShieldAlert, Crown, ImageIcon, X,
} from 'lucide-react'
import type { Database } from '@/types/database'

type Match = Database['public']['Tables']['matches']['Row']
type Tournament = Database['public']['Tables']['tournaments']['Row']

interface Profile { id: string; username: string; display_name: string | null }
interface Participant { player_id: string; epic_username: string | null; profiles: Profile | null }

interface Props {
  match: Match
  tournament: Tournament
  player1: Participant
  player2: Participant
  userId: string | null
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function PlayerCard({
  participant, isWinner, hasClaimed, isMe, claimedSelf,
}: {
  participant: Participant
  isWinner: boolean
  hasClaimed: boolean
  isMe: boolean
  claimedSelf: boolean | null
}) {
  const name = participant.profiles?.display_name || participant.profiles?.username || '?'
  return (
    <div className={`flex-1 rounded-2xl p-5 border flex flex-col items-center gap-2 ${
      isWinner
        ? 'bg-[#e85d24]/10 border-[#e85d24]/50 shadow-[0_0_30px_rgba(232,93,36,0.15)]'
        : 'bg-[#111] border-[#1e1e1e]'
    }`}>
      <div className="relative">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl ${
          isWinner ? 'bg-[#e85d24]' : isMe ? 'bg-[#1e1e1e] border-2 border-[#e85d24]/40' : 'bg-[#2a2a2a]'
        }`}>
          {name[0].toUpperCase()}
        </div>
        {isWinner && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
            <Crown size={10} className="text-yellow-900" />
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-sm">{name}{isMe && <span className="text-[#555] font-normal"> (tú)</span>}</p>
        {participant.epic_username && (
          <p className="text-[#e85d24] text-xs font-mono mt-0.5">{participant.epic_username}</p>
        )}
      </div>
      <div className="mt-1">
        {hasClaimed ? (
          <span className="inline-flex items-center gap-1 text-xs bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} /> Reportó
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs bg-[#1a1a1a] text-[#555] border border-[#222] px-2 py-0.5 rounded-full">
            <Hourglass size={11} /> Pendiente
          </span>
        )}
      </div>
    </div>
  )
}

export default function MatchRoom({ match: initMatch, tournament, player1, player2, userId }: Props) {
  const [match, setMatch] = useState<Match>(initMatch)
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(initMatch.created_at).getTime()) / 1000)
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [resultStatus, setResultStatus] = useState<'pending_opponent' | 'completed' | 'disputed' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const isPlayer1 = userId === player1.player_id
  const isPlayer2 = userId === player2.player_id
  const isParticipant = isPlayer1 || isPlayer2
  const myClaimedWinner = isPlayer1 ? match.player1_claimed_winner : match.player2_claimed_winner
  const hasReported = !!myClaimedWinner

  // Timer
  useEffect(() => {
    if (match.status !== 'in_progress') return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(match.created_at).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [match.status, match.created_at])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`match:${match.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `id=eq.${match.id}`,
      }, (payload) => {
        setMatch(prev => ({ ...prev, ...(payload.new as Match) }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [match.id])

  // Preview selected file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const uploadAndSubmit = async (claimedWinnerId: string) => {
    if (!selectedFile) {
      setError('Debes subir una captura de pantalla como evidencia')
      return
    }
    setError(null)
    setUploading(true)

    let screenshotUrl: string | null = null
    try {
      const ext = selectedFile.name.split('.').pop() ?? 'jpg'
      const path = `${match.id}/${userId}-${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('match-screenshots')
        .upload(path, selectedFile, { upsert: true })
      if (uploadError) throw new Error(uploadError.message)
      const { data: urlData } = supabase.storage.from('match-screenshots').getPublicUrl(uploadData.path)
      screenshotUrl = urlData.publicUrl
    } catch (err: any) {
      setError('Error al subir la imagen: ' + err.message)
      setUploading(false)
      return
    }
    setUploading(false)

    startTransition(async () => {
      const result = await submitMatchResult(match.id, claimedWinnerId, screenshotUrl)
      if ('error' in result) {
        setError(result.error ?? 'Error desconocido')
      } else {
        setResultStatus(result.resultStatus)
      }
    })
  }

  const isLoading = uploading || isPending

  // --- Status derivations ---
  const p1claimed = match.player1_claimed_winner
  const p2claimed = match.player2_claimed_winner

  const statusLabel = {
    in_progress: 'En curso',
    completed: 'Completada',
    disputed: 'En disputa',
    pending: 'Pendiente',
  }[match.status] ?? match.status

  const statusColor = {
    in_progress: 'text-[#e85d24] border-[#e85d24]/30 bg-[#e85d24]/10',
    completed: 'text-green-400 border-green-400/30 bg-green-400/10',
    disputed: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    pending: 'text-[#888] border-[#222] bg-[#111]',
  }[match.status] ?? ''

  const winner = match.winner_id === player1.player_id ? player1 : match.winner_id === player2.player_id ? player2 : null

  return (
    <div className="space-y-5">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400"><X size={14} /></button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl px-5 py-4">
        <div>
          <p className="text-[#888] text-xs mb-0.5">{tournament.game_mode}</p>
          <p className="text-white font-black text-lg leading-none">{tournament.title}</p>
        </div>
        <div className="text-right">
          <div className="text-[#e85d24] font-black text-2xl leading-none">${tournament.prize_pool}</div>
          <p className="text-[#555] text-xs mt-0.5">MXN premio</p>
        </div>
      </div>

      {/* Status + Timer */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`flex items-center gap-2.5 border rounded-xl px-4 py-3 ${statusColor}`}>
          <div className={`w-2 h-2 rounded-full ${
            match.status === 'in_progress' ? 'bg-[#e85d24] animate-pulse' :
            match.status === 'completed' ? 'bg-green-400' :
            match.status === 'disputed' ? 'bg-yellow-400 animate-pulse' : 'bg-[#555]'
          }`} />
          <span className="font-bold text-sm">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-2.5 bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl px-4 py-3">
          <Clock size={15} className={elapsed > 1800 ? 'text-yellow-400' : 'text-[#555]'} />
          <span className={`font-mono font-bold text-sm ${elapsed > 1800 ? 'text-yellow-400' : 'text-white'}`}>
            {formatElapsed(elapsed)}
          </span>
          {elapsed > 1800 && <span className="text-yellow-400 text-xs">¡+30 min!</span>}
        </div>
      </div>

      {/* Players VS */}
      <div className="flex items-stretch gap-3">
        <PlayerCard
          participant={player1}
          isWinner={match.winner_id === player1.player_id}
          hasClaimed={!!p1claimed}
          isMe={userId === player1.player_id}
          claimedSelf={p1claimed ? p1claimed === player1.player_id : null}
        />
        <div className="flex items-center justify-center px-1">
          <span className="text-[#2a2a2a] font-black text-sm">VS</span>
        </div>
        <PlayerCard
          participant={player2}
          isWinner={match.winner_id === player2.player_id}
          hasClaimed={!!p2claimed}
          isMe={userId === player2.player_id}
          claimedSelf={p2claimed ? p2claimed === player2.player_id : null}
        />
      </div>

      {/* ── ACTION AREA ── */}

      {/* In progress — report result */}
      {match.status === 'in_progress' && isParticipant && !hasReported && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-white font-bold text-base flex items-center gap-2">
              <Trophy size={16} className="text-[#e85d24]" />
              Reportar resultado
            </h3>
            <p className="text-[#888] text-xs mt-1">Sube una captura de pantalla como evidencia y declara el resultado.</p>
          </div>

          {/* Screenshot upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="Evidencia"
                  className="w-full rounded-xl border border-[#222] object-cover max-h-52"
                />
                <button
                  onClick={() => { setSelectedFile(null); setPreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-black transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#2a2a2a] hover:border-[#e85d24]/50 rounded-xl py-8 flex flex-col items-center gap-2 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-[#1a1a1a] group-hover:bg-[#e85d24]/10 flex items-center justify-center transition-colors">
                  <ImageIcon size={18} className="text-[#555] group-hover:text-[#e85d24] transition-colors" />
                </div>
                <p className="text-[#888] text-sm group-hover:text-white transition-colors">Toca para subir captura</p>
                <p className="text-[#444] text-xs">JPG, PNG, WEBP · máx 5 MB</p>
              </button>
            )}
          </div>

          {/* Win / Lose buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => uploadAndSubmit(userId!)}
              disabled={!selectedFile || isLoading}
              className="flex flex-col items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-40 border border-green-500/30 text-green-400 font-black py-4 rounded-xl transition-all"
            >
              <Trophy size={20} />
              <span className="text-sm">{isLoading ? 'Enviando...' : 'Yo gané'}</span>
            </button>
            <button
              onClick={() => {
                const rival = isPlayer1 ? player2.player_id : player1.player_id
                uploadAndSubmit(rival)
              }}
              disabled={!selectedFile || isLoading}
              className="flex flex-col items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 border border-red-500/30 text-red-400 font-black py-4 rounded-xl transition-all"
            >
              <X size={20} />
              <span className="text-sm">{isLoading ? 'Enviando...' : 'Yo perdí'}</span>
            </button>
          </div>

          {!selectedFile && (
            <p className="text-center text-[#555] text-xs flex items-center justify-center gap-1">
              <Upload size={11} /> Sube la captura primero para habilitar los botones
            </p>
          )}
        </div>
      )}

      {/* Waiting for opponent */}
      {match.status === 'in_progress' && isParticipant && hasReported && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl p-6 text-center">
          <Hourglass size={28} className="text-[#e85d24] mx-auto mb-3 animate-pulse" />
          <h3 className="text-white font-bold mb-1">Resultado enviado</h3>
          <p className="text-[#888] text-sm">Esperando que tu rival reporte su resultado…</p>
          <div className="flex justify-center gap-1.5 mt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-[#e85d24] animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Not a participant viewing in_progress */}
      {match.status === 'in_progress' && !isParticipant && (
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl px-4 py-3 text-center">
          <p className="text-[#888] text-sm">Partida en curso</p>
        </div>
      )}

      {/* DISPUTED */}
      {match.status === 'disputed' && (
        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-yellow-400" />
            <h3 className="text-yellow-400 font-bold">Disputa en revisión</h3>
          </div>
          <p className="text-[#888] text-sm">
            Los dos jugadores reportaron resultados diferentes. Un administrador revisará las capturas y resolverá la disputa.
          </p>
          {/* Screenshots */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: player1.profiles?.display_name || player1.profiles?.username, url: match.player1_screenshot_url },
              { label: player2.profiles?.display_name || player2.profiles?.username, url: match.player2_screenshot_url },
            ].map(({ label, url }) => (
              <div key={label} className="space-y-1.5">
                <p className="text-[#888] text-xs truncate">{label}</p>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt="Evidencia" className="w-full rounded-xl border border-[#222] object-cover max-h-32 hover:opacity-80 transition-opacity" />
                  </a>
                ) : (
                  <div className="w-full h-20 bg-[#111] border border-[#222] rounded-xl flex items-center justify-center">
                    <ImageIcon size={16} className="text-[#333]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPLETED */}
      {match.status === 'completed' && winner && (
        <div className="bg-[#0d0d0d] border border-yellow-400/20 rounded-2xl p-5 text-center space-y-2">
          <Crown size={28} className="text-yellow-400 mx-auto" />
          <p className="text-[#888] text-xs uppercase tracking-widest">Ganador</p>
          <p className="text-white font-black text-2xl">
            {winner.profiles?.display_name || winner.profiles?.username}
          </p>
          {winner.epic_username && (
            <p className="text-[#e85d24] font-mono text-sm">{winner.epic_username}</p>
          )}
          <div className="inline-block bg-[#e85d24]/10 border border-[#e85d24]/30 rounded-xl px-4 py-2 mt-2">
            <p className="text-[#e85d24] font-black text-xl">${tournament.prize_pool} MXN</p>
            <p className="text-[#888] text-xs">cobrados automáticamente</p>
          </div>
          {match.admin_note && (
            <p className="text-[#555] text-xs mt-2 italic">Admin: {match.admin_note}</p>
          )}
        </div>
      )}

      {/* Result status toast (after submitting) */}
      {resultStatus === 'pending_opponent' && !hasReported && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />
          <p className="text-green-400 text-sm">Resultado enviado. Esperando a tu rival…</p>
        </div>
      )}
    </div>
  )
}
