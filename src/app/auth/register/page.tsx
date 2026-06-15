'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (username.length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, full_name: username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Este email ya está registrado')
      } else {
        setError(error.message)
      }
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError('Error al registrarse con Google')
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#08071a] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-400/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">¡Revisa tu email!</h2>
          <p className="text-[#888] mb-6">
            Te enviamos un enlace de confirmación a <strong className="text-white">{email}</strong>.
            Haz clic en él para activar tu cuenta.
          </p>
          <Link
            href="/auth/login"
            className="inline-block bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08071a] flex items-center justify-center px-4 py-12">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#8b5cf6]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-[#8b5cf6] rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-lg">R</span>
            </div>
            <span className="text-white font-black text-2xl tracking-wider">RISK</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Crea tu cuenta</h1>
          <p className="text-[#888] mt-2">Empieza a competir por dinero real</p>
        </div>

        <div className="bg-[#0f0e2a] border border-[#272454] rounded-2xl p-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 rounded-xl transition-colors mb-6 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Registrarse con Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[#272454]" />
            <span className="text-[#888] text-sm">o</span>
            <div className="flex-1 h-px bg-[#272454]" />
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#ccc] mb-1.5">Nombre de usuario</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  placeholder="jugador123"
                  minLength={3}
                  maxLength={20}
                  className="w-full bg-[#08071a] border border-[#272454] rounded-lg pl-10 pr-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#8b5cf6] transition-colors"
                />
              </div>
              <p className="text-[#555] text-xs mt-1">Solo letras, números y guiones bajos</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#ccc] mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  className="w-full bg-[#08071a] border border-[#272454] rounded-lg pl-10 pr-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#8b5cf6] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#ccc] mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  className="w-full bg-[#08071a] border border-[#272454] rounded-lg pl-10 pr-12 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#8b5cf6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors mt-2"
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>

          <p className="text-[#555] text-xs text-center mt-4">
            Al registrarte, aceptas nuestros{' '}
            <Link href="/terms" className="text-[#888] hover:text-white">Términos de servicio</Link>
            {' '}y{' '}
            <Link href="/privacy" className="text-[#888] hover:text-white">Política de privacidad</Link>
          </p>
        </div>

        <p className="text-center text-[#888] mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link href="/auth/login" className="text-[#8b5cf6] font-semibold hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
