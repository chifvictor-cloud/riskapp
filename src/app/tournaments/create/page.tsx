'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Creation is handled via modal on /tournaments
export default function CreateTournamentPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/tournaments') }, [])
  return null
}
