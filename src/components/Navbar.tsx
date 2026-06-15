'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Trophy, Wallet, LogOut, Menu, X, ShoppingBag } from 'lucide-react'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [balance, setBalance] = useState<number>(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data) setBalance((data as { balance: number }).balance)
          })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#08071a]/95 backdrop-blur-sm border-b border-[#272454]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#8b5cf6] rounded-sm flex items-center justify-center">
              <span className="text-white font-black text-sm">R</span>
            </div>
            <span className="text-white font-black text-xl tracking-wider">RISK</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/tournaments" className="text-[#888] hover:text-white transition-colors text-sm font-medium">
              Torneos
            </Link>
            <Link href="/leaderboard" className="text-[#888] hover:text-white transition-colors text-sm font-medium">
              Ranking
            </Link>
            {user && (
              <>
                <Link href="/dashboard" className="text-[#888] hover:text-white transition-colors text-sm font-medium">
                  Dashboard
                </Link>
                <Link href="/store" className="flex items-center gap-1.5 text-[#888] hover:text-white transition-colors text-sm font-medium">
                  <ShoppingBag size={13} />
                  Tienda
                </Link>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2 bg-[#0f0e2a] border border-[#272454] rounded-lg px-3 py-1.5">
                  <Wallet size={14} className="text-[#8b5cf6]" />
                  <span className="text-white font-semibold text-sm">${balance.toFixed(2)}</span>
                </div>
                <Link
                  href="/profile"
                  className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm"
                >
                  {user.email?.[0].toUpperCase()}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-[#888] hover:text-red-400 transition-colors p-2"
                  title="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-[#888] hover:text-white transition-colors text-sm font-medium px-4 py-2"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#888] hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0f0e2a] border-t border-[#272454] px-4 py-4 space-y-3">
          <Link href="/tournaments" className="block text-[#888] hover:text-white py-2">Torneos</Link>
          <Link href="/leaderboard" className="block text-[#888] hover:text-white py-2">Ranking</Link>
          {user ? (
            <>
              <Link href="/dashboard" className="block text-[#888] hover:text-white py-2">Dashboard</Link>
              <Link href="/store" className="block text-[#888] hover:text-white py-2">Tienda</Link>
              <Link href="/profile" className="block text-[#888] hover:text-white py-2">Perfil</Link>
              <button onClick={handleSignOut} className="block text-red-400 py-2 w-full text-left">
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="block text-[#888] hover:text-white py-2">Iniciar sesión</Link>
              <Link href="/auth/register" className="block bg-[#8b5cf6] text-white py-2 px-4 rounded-lg text-center font-semibold">
                Registrarse
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
