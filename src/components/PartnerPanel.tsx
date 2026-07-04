'use client'

import { useState } from 'react'
import { Link2, Copy, Check, Users, Coins } from 'lucide-react'

interface Props {
  code: string
  totalSignups: number
  qualified: number
}

export default function PartnerPanel({ code, totalSignups, qualified }: Props) {
  const [copied, setCopied] = useState(false)
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://riskapp-seven.vercel.app'}/?ref=${code}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard no disponible (http/permisos): no romper la UI
    }
  }

  return (
    <div className="bg-[#111] border border-[#e85d24]/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-[#e85d24]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <Link2 size={14} className="text-[#e85d24]" />
        </div>
        <div>
          <p className="text-white font-bold text-sm">Programa de partners</p>
          <p className="text-[#555] text-xs">Comparte tu link y gana por cada referido</p>
        </div>
      </div>

      {/* Link + copiar */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 min-w-0">
          <p className="text-[#e85d24] text-xs font-mono truncate">{link}</p>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors flex-shrink-0 ${
            copied
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-[#e85d24] hover:bg-[#d04e1a] text-white'
          }`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={12} className="text-[#e85d24]" />
            <span className="text-[#555] text-xs">Registrados con tu link</span>
          </div>
          <p className="text-white font-black text-xl">{totalSignups}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Coins size={12} className="text-[#e85d24]" />
            <span className="text-[#555] text-xs">Con depósito</span>
          </div>
          <p className="text-white font-black text-xl">{qualified}</p>
        </div>
      </div>
    </div>
  )
}
