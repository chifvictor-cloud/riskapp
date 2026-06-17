import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const amount = Number(body.amount)

  if (!amount || amount < 50 || amount > 10000) {
    return Response.json({ error: 'Monto inválido (50–10,000 MXN)' }, { status: 400 })
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
      description: `Depósito MercadoPago $${amount} MXN`,
    })
    .select('id')
    .single()

  if (txError || !tx) {
    return Response.json({ error: 'Error al crear transacción' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const preference = new Preference(mp)
  const result = await preference.create({
    body: {
      items: [{
        id: 'deposit',
        title: 'Depósito RISK',
        description: `Recarga de saldo — $${amount} MXN`,
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
      notification_url: `${appUrl}/api/payments/webhook`,
      external_reference: `${user.id}::${tx.id}`,
      statement_descriptor: 'RISK PLATFORM',
    },
  })

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
