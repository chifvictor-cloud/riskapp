import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

const PACKAGES = [
  { id: 'p1', precio: 29,  puntos: 1000  },
  { id: 'p2', precio: 99,  puntos: 5000  },
  { id: 'p3', precio: 199, puntos: 11000 },
] as const

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const packageId = body.packageId as string | undefined
  const pkg = packageId ? PACKAGES.find(p => p.id === packageId) : undefined

  let amount: number

  if (packageId !== undefined) {
    if (!pkg) return Response.json({ error: 'Paquete inválido' }, { status: 400 })
    amount = pkg.precio
  } else {
    amount = Number(body.amount)
    if (!amount || amount < 50 || amount > 10000) {
      return Response.json({ error: 'Monto inválido (50–10,000 MXN)' }, { status: 400 })
    }
  }

  const admin = createAdminClient() as any

  // Create pending transaction first to get an ID for external_reference
  const { data: tx, error: txError } = await admin
    .from('transactions')
    .insert({
      user_id: user.id,
      type: 'deposit',
      amount,
      status: 'pending',
      description: pkg
        ? `Paquete ${pkg.puntos.toLocaleString()} puntos — $${pkg.precio} MXN`
        : `Depósito MercadoPago $${amount} MXN`,
    })
    .select('id')
    .single()

  if (txError || !tx) {
    return Response.json({ error: 'Error al crear transacción' }, { status: 500 })
  }

  const extRef = pkg
    ? `${user.id}::${tx.id}::points::${pkg.puntos}`
    : `${user.id}::${tx.id}`

  const appUrl = 'https://riskapp-seven.vercel.app'
  const webhookUrl = `${appUrl}/api/payments/webhook`

  console.log('[create] notification_url:', webhookUrl)
  console.log('[create] external_reference:', extRef)

  const preference = new Preference(mp)
  const result = await preference.create({
    body: {
      items: [{
        id: pkg ? pkg.id : 'deposit',
        title: pkg ? `RISK — ${pkg.puntos.toLocaleString()} puntos` : 'Depósito RISK',
        description: pkg
          ? `Paquete de ${pkg.puntos.toLocaleString()} puntos para la tienda RISK`
          : `Recarga de saldo — $${amount} MXN`,
        quantity: 1,
        currency_id: 'MXN',
        unit_price: amount,
      }],
      payer: { email: user.email },
      back_urls: {
        success: `${appUrl}/deposit/success`,
        failure: `${appUrl}/deposit/failure`,
        pending: `${appUrl}/deposit/pending`,
      },
      auto_return: 'approved',
      notification_url: webhookUrl,
      external_reference: extRef,
      statement_descriptor: 'RISK PLATFORM',
    },
  })

  console.log('[create] preference id:', result.id, '| init_point set:', !!result.init_point)

  // Store MP preference ID for traceability
  await admin
    .from('transactions')
    .update({ reference_id: result.id })
    .eq('id', tx.id)

  return Response.json({
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point,
  })
}
