import { ReactNode } from 'react'

export type FrameTier = 1 | 2 | 3 | 4 | 5

export const TIER_NAMES: Record<FrameTier, string> = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Diamond',
  5: 'Legendary',
}

interface PlayerFrameProps {
  /** Tier del marco (1-5). Valores fuera de rango se fijan a Bronze/Legendary. */
  tier: number
  children: ReactNode
  className?: string
}

/**
 * Wrapper visual del marco evolutivo del jugador (M1).
 * No trae tamaño propio: se dimensiona con className (ej. `w-[72px] h-[72px]`),
 * igual que los círculos de avatar existentes en SpectateRoom.
 */
export default function PlayerFrame({ tier, children, className = '' }: PlayerFrameProps) {
  const safeTier = Math.min(5, Math.max(1, Math.trunc(tier) || 1)) as FrameTier
  return (
    <div
      className={`player-frame player-frame-tier-${safeTier} ${className}`}
      title={TIER_NAMES[safeTier]}
    >
      {children}
    </div>
  )
}
