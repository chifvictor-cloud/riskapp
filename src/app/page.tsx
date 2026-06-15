import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { Trophy, Shield, Zap, DollarSign, ChevronRight, Users } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#7c3aed 1px, transparent 1px), linear-gradient(90deg, #7c3aed 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#7c3aed]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-full px-4 py-1.5 mb-8">
            <div className="w-2 h-2 bg-[#7c3aed] rounded-full animate-pulse" />
            <span className="text-[#7c3aed] text-sm font-medium">Plataforma 1v1 Fortnite</span>
          </div>

          <h1 className="text-6xl sm:text-7xl md:text-8xl font-black text-white mb-6 leading-none tracking-tight">
            COMPITE.
            <br />
            <span style={{ color: '#7c3aed' }}>GANA.</span>
            <br />
            COBRA.
          </h1>

          <p className="text-[#888] text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            El arena competitivo de Fortnite donde cada partida es por dinero real.
            Demuestra que eres el mejor en duelos 1v1.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/register"
              className="group flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold px-8 py-4 rounded-xl text-lg transition-all duration-200 shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_40px_rgba(124,58,237,0.5)]"
            >
              Empezar gratis
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/tournaments"
              className="flex items-center gap-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#7c3aed]/40 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all duration-200"
            >
              Ver torneos
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-8 mt-16 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-3xl font-black text-white">$50K+</div>
              <div className="text-[#888] text-sm mt-1">Pagados</div>
            </div>
            <div className="text-center border-x border-[#222]">
              <div className="text-3xl font-black text-white">12K+</div>
              <div className="text-[#888] text-sm mt-1">Jugadores</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-white">99%</div>
              <div className="text-[#888] text-sm mt-1">Pagos a tiempo</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-white mb-4">¿Cómo funciona?</h2>
            <p className="text-[#888] text-lg">Tres pasos para empezar a ganar</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: <Users size={28} className="text-[#7c3aed]" />,
                title: 'Regístrate',
                desc: 'Crea tu cuenta gratis y vincula tu usuario de Fortnite en menos de 2 minutos.',
              },
              {
                step: '02',
                icon: <DollarSign size={28} className="text-[#7c3aed]" />,
                title: 'Deposita fondos',
                desc: 'Añade dinero a tu billetera de RISK con tarjeta o transferencia bancaria.',
              },
              {
                step: '03',
                icon: <Trophy size={28} className="text-[#7c3aed]" />,
                title: 'Compite y cobra',
                desc: 'Únete a un torneo 1v1, derrota a tu rival y recibe el premio al instante.',
              },
            ].map((item, i) => (
              <div key={i} className="relative bg-[#111] border border-[#222] rounded-2xl p-8 hover:border-[#7c3aed]/30 transition-all group">
                <div className="absolute top-6 right-6 text-[#1e1e1e] font-black text-5xl group-hover:text-[#7c3aed]/10 transition-colors">
                  {item.step}
                </div>
                <div className="w-14 h-14 bg-[#7c3aed]/10 rounded-xl flex items-center justify-center mb-6">
                  {item.icon}
                </div>
                <h3 className="text-white font-bold text-xl mb-3">{item.title}</h3>
                <p className="text-[#888] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 border-t border-[#111]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-black text-white mb-6">
                La plataforma más{' '}
                <span style={{ color: '#7c3aed' }}>segura</span>{' '}
                para competir
              </h2>
              <p className="text-[#888] text-lg mb-8 leading-relaxed">
                RISK garantiza pagos justos, verificación de resultados y soporte 24/7.
              </p>

              <div className="space-y-4">
                {[
                  { icon: <Shield size={18} className="text-[#7c3aed]" />, text: 'Pagos verificados y seguros' },
                  { icon: <Zap size={18} className="text-[#7c3aed]" />, text: 'Matchmaking instantáneo' },
                  { icon: <Trophy size={18} className="text-[#7c3aed]" />, text: 'Rankings y estadísticas en tiempo real' },
                  { icon: <Users size={18} className="text-[#7c3aed]" />, text: 'Comunidad activa de jugadores' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#7c3aed]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      {item.icon}
                    </div>
                    <span className="text-[#ccc] font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-[#111] border border-[#222] rounded-2xl p-8 shadow-[0_0_60px_rgba(124,58,237,0.1)]">
                <div className="text-center mb-6">
                  <div className="text-[#888] text-sm mb-2">Premio disponible</div>
                  <div className="text-[#7c3aed] text-6xl font-black">$100</div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-3 border-b border-[#222]">
                    <span className="text-[#888]">Modo de juego</span>
                    <span className="text-white font-semibold">Duelos 1v1</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[#222]">
                    <span className="text-[#888]">Entrada</span>
                    <span className="text-white font-semibold">$50</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[#888]">Estado</span>
                    <span className="text-green-400 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                      Abierto
                    </span>
                  </div>
                </div>
                <Link
                  href="/auth/register"
                  className="mt-6 w-full block text-center bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Unirse al torneo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-[#111] border border-[#7c3aed]/20 rounded-2xl p-12 shadow-[0_0_60px_rgba(124,58,237,0.08)]">
            <h2 className="text-4xl font-black text-white mb-4">¿Listo para competir?</h2>
            <p className="text-[#888] text-lg mb-8">
              Únete a miles de jugadores y empieza a ganar dinero real jugando Fortnite.
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold px-10 py-4 rounded-xl text-lg transition-all shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_50px_rgba(124,58,237,0.4)]"
            >
              Crear cuenta gratis
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#111] py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#7c3aed] rounded-sm flex items-center justify-center">
              <span className="text-white font-black text-xs">R</span>
            </div>
            <span className="text-white font-black text-lg">RISK</span>
          </div>
          <p className="text-[#888] text-sm">© 2026 RISK. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="text-[#888] hover:text-white text-sm transition-colors">Términos</Link>
            <Link href="/privacy" className="text-[#888] hover:text-white text-sm transition-colors">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
