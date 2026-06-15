'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTournament } from '@/app/tournaments/[id]/actions'
import { X, Trophy, Hammer, Zap, AlertCircle, ChevronRight } from 'lucide-react'

const FORMATS = [
  { value: 'No Build', label: 'No Build', desc: 'Sin construcciones. Puro aim.', icon: <Trophy size={22} className="text-[#7c3aed]" /> },
  { value: 'Construcción', label: 'Construcción', desc: 'Con edificación completa.', icon: <Hammer size={22} className="text-[#7c3aed]" /> },
  { value: 'Zero Build', label: 'Zero Build', desc: 'Escudos de adrenalina.', icon: <Zap size={22} className="text-[#7c3aed]" /> },
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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const prizePool = entryFee ? entryFee * 2 : null

  const handleSubmit = () => {
    if (!format || !entryFee || !epicUsername.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createTournament(entryFee, format, epicUsername.trim())
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
      <div className="relative w-full sm:max-w-lg bg-[#0e0e0e] border border-[#1e1e1e] rounded-t-3xl sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#1a1a1a]">
          <div>
            <p className="text-[#7c3aed] text-xs font-bold uppercase tracking-widest mb-0.5">Nuevo torneo</p>
            <h2 className="text-white font-black text-lg">
              {step === 1 && 'Elige el formato'}
              {step === 2 && 'Cuota de entrada'}
              {step === 3 && 'Tu nombre en Epic'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-white transition-colors rounded-lg hover:bg-[#1a1a1a]">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-6 py-3 gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-[#7c3aed]' : 'bg-[#222]'}`} />
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
                      ? 'border-[#7c3aed] bg-[#7c3aed]/8'
                      : 'border-[#222] bg-[#111] hover:border-[#2e2e2e] hover:bg-[#141414]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${format === f.value ? 'bg-[#7c3aed]/15' : 'bg-[#1a1a1a]'}`}>
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
                        ? 'border-[#7c3aed] bg-[#7c3aed]/10 text-white'
                        : 'border-[#222] bg-[#111] text-[#888] hover:border-[#2e2e2e] hover:text-white'
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

          {/* Step 3: Epic username + summary */}
          {step === 3 && (
            <div className="mt-1">
              <input
                type="text"
                value={epicUsername}
                onChange={e => setEpicUsername(e.target.value)}
                placeholder="TuNombreEnEpic"
                maxLength={32}
                autoFocus
                className="w-full bg-[#111] border border-[#222] focus:border-[#7c3aed] rounded-xl px-4 py-3 text-white placeholder-[#444] outline-none transition-colors mb-4 font-mono"
              />

              {/* Summary */}
              <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#888]">Formato</span><span className="text-white font-semibold">{format}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Tu entrada</span><span className="text-white font-semibold">${entryFee} MXN</span></div>
                <div className="flex justify-between border-t border-[#1a1a1a] pt-2">
                  <span className="text-[#888]">Premio si ganas</span>
                  <span className="text-[#7c3aed] font-black">${prizePool} MXN</span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!epicUsername.trim() || isPending}
                className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(124,58,237,0.2)]"
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
