'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTournament } from '@/app/tournaments/[id]/actions'
import { X, Trophy, Hammer, Zap, AlertCircle, ChevronRight, Tv2, ChevronDown } from 'lucide-react'

const FORMATS = [
  { value: 'No Build', label: 'No Build', desc: 'Sin construcciones. Puro aim.', icon: <Trophy size={22} className="text-[#8b5cf6]" /> },
  { value: 'Construcción', label: 'Construcción', desc: 'Con edificación completa.', icon: <Hammer size={22} className="text-[#8b5cf6]" /> },
  { value: 'Zero Build', label: 'Zero Build', desc: 'Escudos de adrenalina.', icon: <Zap size={22} className="text-[#8b5cf6]" /> },
]

const ENTRY_FEES = [20, 50, 100, 150, 200, 300, 500, 1000]

interface Props {
  onClose: () => void
  defaultEpicUsername?: string | null
}

export default function CreateTournamentModal({ onClose, defaultEpicUsername }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [format, setFormat] = useState('')
  const [entryFee, setEntryFee] = useState<number | null>(null)
  const [epicUsername, setEpicUsername] = useState(defaultEpicUsername ?? '')
  const [isCreator, setIsCreator] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [chatPotEnabled, setChatPotEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const prizePool = entryFee ? entryFee * 2 : null

  const handleSubmit = () => {
    if (!format || !entryFee || !epicUsername.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createTournament(
        entryFee,
        format,
        epicUsername.trim(),
        isCreator ? { isCreator: true, streamUrl, chatPotEnabled } : undefined,
      )
      if ('error' in result) {
        setError(result.error ?? 'Error al crear el torneo')
      } else {
        onClose()
        router.push(`/tournaments/${result.tournamentId}`)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm px-0 sm:px-4">
      <div className="relative w-full sm:max-w-lg bg-[#0f0e2a] border border-[#201e50] rounded-t-3xl sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#1e1b4b]">
          <div>
            <p className="text-[#8b5cf6] text-xs font-bold uppercase tracking-widest mb-0.5">Nuevo torneo</p>
            <h2 className="text-white font-black text-lg">
              {step === 1 && 'Elige el formato'}
              {step === 2 && 'Cuota de entrada'}
              {step === 3 && 'Tu nombre en Epic'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-white transition-colors rounded-lg hover:bg-[#1e1b4b]">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-6 py-3 gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-[#8b5cf6]' : 'bg-[#272454]'}`} />
          ))}
        </div>

        <div className="px-6 pb-6">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {/* Step 1: Format */}
          {step === 1 && (
            <div className="space-y-2.5 mt-1">
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  onClick={() => { setFormat(f.value); setStep(2) }}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                    format === f.value
                      ? 'border-[#8b5cf6] bg-[#8b5cf6]/8'
                      : 'border-[#272454] bg-[#0f0e2a] hover:border-[#302d65] hover:bg-[#100f2e]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${format === f.value ? 'bg-[#8b5cf6]/15' : 'bg-[#1e1b4b]'}`}>
                    {f.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{f.label}</p>
                    <p className="text-[#888] text-xs">{f.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#444]" />
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Entry fee */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {ENTRY_FEES.map(fee => (
                  <button
                    key={fee}
                    onClick={() => { setEntryFee(fee); setStep(3) }}
                    className={`py-3.5 rounded-xl border font-black text-sm transition-all ${
                      entryFee === fee
                        ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-white'
                        : 'border-[#272454] bg-[#0f0e2a] text-[#888] hover:border-[#302d65] hover:text-white'
                    }`}
                  >
                    ${fee}
                    <span className="block text-[10px] font-normal text-[#555] mt-0.5">MXN</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="mt-4 text-[#555] text-xs hover:text-[#888] transition-colors">
                ← Cambiar formato
              </button>
            </>
          )}

          {/* Step 3: Epic username + creator options + summary */}
          {step === 3 && (
            <div className="mt-1">
              <input
                type="text"
                value={epicUsername}
                onChange={e => setEpicUsername(e.target.value)}
                placeholder="TuNombreEnEpic"
                maxLength={32}
                autoFocus
                className="w-full bg-[#0f0e2a] border border-[#272454] focus:border-[#8b5cf6] rounded-xl px-4 py-3 text-white placeholder-[#444] outline-none transition-colors mb-4 font-mono"
              />

              {/* Creator toggle */}
              <div className="mb-4 bg-[#08071a] border border-[#1e1b4b] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsCreator(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${isCreator ? 'bg-[#8b5cf6]' : 'bg-[#272454]'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isCreator ? 'left-4' : 'left-0.5'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <Tv2 size={13} className={isCreator ? 'text-[#8b5cf6]' : 'text-[#555]'} />
                      <span className={`text-sm font-semibold ${isCreator ? 'text-white' : 'text-[#888]'}`}>¿Eres creador de contenido?</span>
                    </div>
                    <p className="text-[#555] text-xs mt-0.5">Activa el modo streamer con chat en vivo y pozo</p>
                  </div>
                  <ChevronDown size={14} className={`text-[#555] transition-transform ${isCreator ? 'rotate-180' : ''}`} />
                </button>

                {isCreator && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#1e1b4b]">
                    <div className="pt-3">
                      <label className="text-[#888] text-xs mb-1.5 block">Link de Twitch o TikTok Live</label>
                      <input
                        type="url"
                        value={streamUrl}
                        onChange={e => setStreamUrl(e.target.value)}
                        placeholder="https://twitch.tv/tucanal"
                        className="w-full bg-[#0f0e2a] border border-[#272454] focus:border-[#8b5cf6] rounded-lg px-3 py-2 text-white placeholder-[#444] outline-none transition-colors text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={chatPotEnabled}
                        onChange={e => setChatPotEnabled(e.target.checked)}
                        className="w-4 h-4 accent-[#8b5cf6]"
                      />
                      <div>
                        <p className="text-white text-xs font-semibold">Activar pozo del chat</p>
                        <p className="text-[#555] text-[10px]">10% del rake va al pozo — se sortea entre espectadores que acertaron</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#888]">Formato</span><span className="text-white font-semibold">{format}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Tu entrada</span><span className="text-white font-semibold">${entryFee} MXN</span></div>
                {isCreator && (
                  <div className="flex justify-between"><span className="text-[#888]">Modo</span><span className="text-[#8b5cf6] font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />EN VIVO</span></div>
                )}
                <div className="flex justify-between border-t border-[#1e1b4b] pt-2">
                  <span className="text-[#888]">Premio si ganas</span>
                  <span className="text-[#8b5cf6] font-black">${prizePool} MXN</span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!epicUsername.trim() || isPending}
                className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.2)]"
              >
                {isPending ? 'Creando...' : 'Crear torneo y entrar como J1'}
              </button>

              <button onClick={() => setStep(2)} className="mt-3 w-full text-[#555] text-xs hover:text-[#888] transition-colors">
                ← Cambiar entrada
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
