'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const REF_KEY = 'risk_ref'

function ReferralTrackerInner() {
  const searchParams = useSearchParams()
  const attributing = useRef(false)

  useEffect(() => {
    // Captura: guarda el código para que sobreviva el flujo OAuth (redirects)
    const ref = searchParams.get('ref')
    if (ref) localStorage.setItem(REF_KEY, ref)

    const supabase = createClient()

    // Atribución silenciosa: se limpia sin importar el resultado del RPC
    // (already_referred / invalid_code no se muestran al usuario)
    const tryAttribute = async () => {
      if (attributing.current) return
      const code = localStorage.getItem(REF_KEY)
      if (!code) return
      attributing.current = true
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return // sin sesión aún: conservar el código para después del login
        await (supabase as any).rpc('attribute_referral', { p_code: code })
        localStorage.removeItem(REF_KEY)
      } finally {
        attributing.current = false
      }
    }

    tryAttribute()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') tryAttribute()
    })
    return () => { subscription.unsubscribe() }
  }, [searchParams])

  return null
}

export default function ReferralTracker() {
  return (
    <Suspense fallback={null}>
      <ReferralTrackerInner />
    </Suspense>
  )
}
