import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

// MP sends a GET to validate the webhook URL — always respond 200
export async function GET() {
  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const rawBody = await request.text()
    const body = rawBody ? JSON.parse(rawBody) : {}

    console.log('[webhook] query:', Object.fromEntries(url.searchParams))
    console.log('[webhook] body:', body)

    // --- Resolve payment ID from any MP notification format ---

    let paymentId: string | null = null

    // Format 1: Webhooks API (configured in MP panel)
    //   POST body: { type: 'payment', action: 'payment.created', data: { id: '123' } }
    if (body.type === 'payment' && body.data?.id) {
      paymentId = String(body.data.id)
    }

    // Format 2: IPN via notification_url in preference — query string
    //   POST /webhook?topic=payment&id=123
    if (!paymentId && url.searchParams.get('topic') === 'payment') {
      paymentId = url.searchParams.get('id')
    }

    // Format 3: IPN via notification_url — JSON body with topic
    //   POST body: { topic: 'payment', resource: '...', id: 123 }
    if (!paymentId && body.topic === 'payment') {
      if (body.id) {
        paymentId = String(body.id)
      } else if (body.resource) {
        const match = String(body.resource).match(/\/payments\/(\d+)/)
        if (match) paymentId = match[1]
      }
    }

    if (!paymentId) {
      console.log('[webhook] no payment ID found, skipping')
      return Response.json({ ok: true })
    }

    console.log('[webhook] processing payment', paymentId)

    // Fetch full payment details from MP API to verify status and get amount
    const paymentApi = new Payment(mp)
    const payment = await paymentApi.get({ id: paymentId })

    console.log('[webhook] payment status:', payment.status, 'amount:', payment.transaction_amount)

    if (payment.status !== 'approved') {
      console.log('[webhook] payment not approved, skipping')
      return Response.json({ ok: true })
    }

    const externalRef = payment.external_reference
    if (!externalRef || !externalRef.includes('::')) {
      console.log('[webhook] invalid external_reference:', externalRef)
      return Response.json({ ok: true })
    }

    const [userId, transactionId] = externalRef.split('::')
    const amount = payment.transaction_amount ?? 0

    if (!userId || !transactionId || amount <= 0) {
      console.log('[webhook] invalid userId/transactionId/amount')
      return Response.json({ ok: true })
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(transactionId)) {
      console.log('[webhook] transactionId is not a UUID:', transactionId)
      return Response.json({ ok: true })
    }

    const admin = createAdminClient() as any

    // Idempotency check — skip if this MP payment was already credited
    const { data: existingTx } = await admin
      .from('transactions')
      .select('status')
      .eq('mp_payment_id', paymentId)
      .maybeSingle()

    if (existingTx?.status === 'completed') {
      console.log('[webhook] already processed (mp_payment_id match), skipping')
      return Response.json({ ok: true })
    }

    const { data: tx, error: txSelectError } = await admin
      .from('transactions')
      .select('status')
      .eq('id', transactionId)
      .single()

    if (txSelectError) {
      console.error('[webhook] tx select error:', txSelectError)
      return Response.json({ ok: true })
    }

    if (!tx || tx.status === 'completed') {
      console.log('[webhook] already processed, skipping')
      return Response.json({ ok: true })
    }

    // Mark transaction completed — the double .eq() prevents race conditions
    const { error: txError } = await admin
      .from('transactions')
      .update({ status: 'completed', mp_payment_id: paymentId })
      .eq('id', transactionId)
      .eq('status', 'pending')

    if (txError) {
      console.error('[webhook] tx update error:', txError)
      return Response.json({ ok: true })
    }

    // Credit balance
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      console.error('[webhook] profile not found:', profileError)
      return Response.json({ ok: true })
    }

    const { error: balanceError } = await admin
      .from('profiles')
      .update({ balance: profile.balance + amount })
      .eq('id', userId)

    if (balanceError) {
      console.error('[webhook] balance update error:', balanceError)
      return Response.json({ ok: true })
    }

    console.log(`[webhook] credited $${amount} to user ${userId}. New balance: ${profile.balance + amount}`)
    return Response.json({ ok: true })

  } catch (err) {
    console.error('[webhook] uncaught error:', err)
    // Always 200 — MP retries on non-2xx and could spam the endpoint
    return Response.json({ ok: true })
  }
}
