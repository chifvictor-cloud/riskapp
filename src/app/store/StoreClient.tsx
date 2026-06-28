'use client'

import { useState, useTransition } from 'react'
import { redeemProduct } from './actions'
import { Crown, Star, Zap, ShoppingBag, Package, CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface Product {
  id: string
  name: string
  description: string | null
  category: 'fortnite' | 'tarjetas' | 'merch'
  points_cost: number
  stock: number | null
  is_active: boolean
  sort_order: number
}

interface Redemption {
  id: string
  product_id: string
  points_spent: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  created_at: string
  store_products: { name: string; category: string } | null
}

interface Props {
  userPoints: number
  isVip: boolean
  products: Product[]
  initialRedemptions: Redemption[]
}

const CATEGORY_LABELS: Record<string, string> = {
  fortnite: 'Fortnite',
  tarjetas: 'Tarjetas Gift',
  merch: 'Merch Risk',
}

const CATEGORY_ICONS: Record<string, string> = {
  fortnite: '🎮',
  tarjetas: '💳',
  merch: '👕',
}

export default function StoreClient({ userPoints, isVip, products, initialRedemptions }: Props) {
  const [activeTab, setActiveTab] = useState<'fortnite' | 'tarjetas' | 'merch'>('fortnite')
  const [points, setPoints] = useState(userPoints)
  const [redemptions, setRedemptions] = useState(initialRedemptions)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [buyingPkg, setBuyingPkg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)

  const handleBuyPackage = async (packageId: string) => {
    setBuyingPkg(packageId)
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Error al crear el pago'); setBuyingPkg(null); return }
      const url = process.env.NODE_ENV === 'production' ? data.init_point : data.sandbox_init_point
      window.location.href = url
    } catch {
      alert('Error de conexión'); setBuyingPkg(null)
    }
  }

  const handleRedeem = (product: Product) => {
    if (points < product.points_cost) return
    setPendingProductId(product.id)
    setSuccessId(null)
    setErrorId(null)
    startTransition(async () => {
      const result = await redeemProduct(product.id)
      if ('error' in result) {
        setErrorId(product.id)
        setErrorMsg(result.error ?? 'Error')
      } else {
        setPoints(p => p - product.points_cost)
        setSuccessId(product.id)
        setRedemptions(prev => [{
          id: Math.random().toString(),
          product_id: product.id,
          points_spent: product.points_cost,
          status: 'pending',
          created_at: new Date().toISOString(),
          store_products: { name: product.name, category: product.category },
        }, ...prev.slice(0, 4)])
        setTimeout(() => setSuccessId(null), 4000)
      }
      setPendingProductId(null)
    })
  }

  const filteredProducts = products.filter(p => p.category === activeTab)

  return (
    <div className="space-y-8">
      {/* Points balance hero */}
      <div className="relative bg-[#0f0e2a] border border-[#8b5cf6]/20 rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#8b5cf6]/4 rounded-full blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[#888] text-sm mb-1">Tus puntos disponibles</p>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-black text-white">{points.toLocaleString()}</span>
              <span className="text-[#8b5cf6] text-lg font-bold mb-1">pts</span>
            </div>
            {isVip && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full mt-2">
                <Crown size={10} />Espectador VIP
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="text-center bg-[#08071a] border border-[#272454] rounded-xl px-4 py-3">
              <div className="text-white font-black text-lg">+10</div>
              <div className="text-[#555] text-[10px]">pts por partida vista</div>
            </div>
            <div className="text-center bg-[#08071a] border border-[#272454] rounded-xl px-4 py-3">
              <div className="text-yellow-400 font-black text-lg">+50</div>
              <div className="text-[#555] text-[10px]">pts si aciertas</div>
            </div>
          </div>
        </div>
      </div>

      {/* VIP + Point packages */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* VIP card */}
        <div className="md:col-span-1 bg-[#0f0e2a] border border-yellow-400/20 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 rounded-full blur-xl pointer-events-none" />
          <div className="relative">
            <div className="w-10 h-10 bg-yellow-400/10 rounded-xl flex items-center justify-center mb-3">
              <Crown size={18} className="text-yellow-400" />
            </div>
            <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest mb-1">Espectador VIP</p>
            <p className="text-white font-black text-2xl mb-1">$49 <span className="text-[#555] font-normal text-sm">MXN/mes</span></p>
            <ul className="space-y-1 mb-4 text-xs text-[#888]">
              <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-yellow-400" />Puntos x2 en cada partida</li>
              <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-yellow-400" />Badge VIP en el chat</li>
              <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-yellow-400" />Acceso anticipado a features</li>
            </ul>
            {isVip ? (
              <div className="text-center text-yellow-400 text-xs font-bold py-2">Ya eres VIP ✓</div>
            ) : (
              <button
                onClick={() => alert('Próximamente — integración de pagos en desarrollo')}
                className="w-full bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                Activar VIP
              </button>
            )}
          </div>
        </div>

        {/* Point packages */}
        <div className="md:col-span-2 grid sm:grid-cols-3 gap-4">
          {[
            { id: 'p1', pts: 1000,  price: 29,  color: '#8b5cf6' },
            { id: 'p2', pts: 5000,  price: 99,  color: '#3b82f6', popular: true },
            { id: 'p3', pts: 11000, price: 199, color: '#10b981', bestValue: true },
          ].map(pkg => (
            <div key={pkg.id} className="relative bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl p-5">
              {pkg.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[#3b82f6] text-white text-[10px] font-black px-3 py-0.5 rounded-full">
                  MÁS POPULAR
                </div>
              )}
              {pkg.bestValue && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-white text-[10px] font-black px-3 py-0.5 rounded-full" style={{ background: pkg.color }}>
                  MEJOR VALOR
                </div>
              )}
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${pkg.color}18` }}>
                <Zap size={16} style={{ color: pkg.color }} />
              </div>
              <div className="flex items-end gap-1 mb-0.5">
                <span className="text-white font-black text-2xl">{pkg.pts.toLocaleString()}</span>
                <span className="text-[#888] text-sm mb-0.5">pts</span>
              </div>
              <p className="text-[#888] text-xs mb-4">${pkg.price} MXN</p>
              <button
                onClick={() => handleBuyPackage(pkg.id)}
                disabled={buyingPkg !== null}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: `${pkg.color}15`, borderColor: `${pkg.color}30`, color: pkg.color }}
              >
                {buyingPkg === pkg.id ? 'Procesando...' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <div>
        {/* Category tabs */}
        <div className="flex gap-2 mb-6 border-b border-[#1e1b4b]">
          {(['fortnite', 'tarjetas', 'merch'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
                activeTab === cat
                  ? 'border-[#8b5cf6] text-[#8b5cf6]'
                  : 'border-transparent text-[#555] hover:text-[#888]'
              }`}
            >
              <span>{CATEGORY_ICONS[cat]}</span>
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-[#555]">
            <Package size={32} className="mx-auto mb-3 opacity-30" />
            <p>No hay productos disponibles en esta categoría</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => {
              const canAfford = points >= product.points_cost
              const outOfStock = product.stock !== null && product.stock <= 0
              const isThisPending = pendingProductId === product.id
              const isSuccess = successId === product.id
              const isError = errorId === product.id

              return (
                <div
                  key={product.id}
                  className={`bg-[#0f0e2a] border rounded-2xl p-5 flex flex-col transition-all ${
                    isSuccess
                      ? 'border-green-400/40'
                      : canAfford && !outOfStock
                      ? 'border-[#1e1b4b] hover:border-[#8b5cf6]/30'
                      : 'border-[#1e1b4b] opacity-60'
                  }`}
                >
                  {/* Product icon placeholder */}
                  <div className="w-12 h-12 bg-[#08071a] border border-[#272454] rounded-xl flex items-center justify-center mb-4 text-2xl">
                    {CATEGORY_ICONS[product.category]}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-white font-bold text-sm mb-1">{product.name}</h3>
                    {product.description && (
                      <p className="text-[#888] text-xs mb-3">{product.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Star size={12} className="text-[#8b5cf6]" />
                      <span className="text-[#8b5cf6] font-black text-sm">{product.points_cost.toLocaleString()} pts</span>
                    </div>
                    {product.stock !== null && (
                      <span className={`text-[10px] font-semibold ${outOfStock ? 'text-red-400' : 'text-[#555]'}`}>
                        {outOfStock ? 'Sin stock' : `Stock: ${product.stock}`}
                      </span>
                    )}
                  </div>

                  {isSuccess ? (
                    <div className="flex items-center justify-center gap-2 bg-green-400/10 border border-green-400/20 text-green-400 py-2.5 rounded-xl text-sm font-bold">
                      <CheckCircle size={14} />
                      ¡Canjeado! Revisa tu email
                    </div>
                  ) : isError ? (
                    <div>
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 py-2 px-3 rounded-xl text-xs mb-2">
                        <AlertCircle size={12} />
                        {errorMsg}
                      </div>
                      <button
                        onClick={() => { setErrorId(null); handleRedeem(product) }}
                        className="w-full bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 text-[#8b5cf6] py-2.5 rounded-xl text-sm font-bold"
                      >
                        Intentar de nuevo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRedeem(product)}
                      disabled={!canAfford || outOfStock || isPending}
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                        !canAfford || outOfStock
                          ? 'bg-[#08071a] border border-[#272454] text-[#444] cursor-not-allowed'
                          : 'bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-[0_0_16px_rgba(139,92,246,0.2)]'
                      }`}
                    >
                      {isThisPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <Clock size={13} className="animate-spin" />
                          Procesando...
                        </span>
                      ) : !canAfford ? (
                        `Faltan ${(product.points_cost - points).toLocaleString()} pts`
                      ) : outOfStock ? (
                        'Sin stock'
                      ) : (
                        'Canjear'
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent redemptions */}
      {redemptions.length > 0 && (
        <div>
          <h2 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
            <ShoppingBag size={14} className="text-[#8b5cf6]" />
            Mis canjes recientes
          </h2>
          <div className="bg-[#0f0e2a] border border-[#1e1b4b] rounded-2xl overflow-hidden divide-y divide-[#0f0e2a]">
            {redemptions.map(r => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                <div className="text-lg flex-shrink-0">{CATEGORY_ICONS[r.store_products?.category ?? 'fortnite']}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{r.store_products?.name ?? 'Producto'}</p>
                  <p className="text-[#555] text-xs">
                    {new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#8b5cf6] font-bold text-sm">-{r.points_spent.toLocaleString()} pts</p>
                  <span className={`text-[10px] font-semibold ${
                    r.status === 'fulfilled' ? 'text-green-400' :
                    r.status === 'cancelled' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {r.status === 'fulfilled' ? 'Entregado' : r.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
