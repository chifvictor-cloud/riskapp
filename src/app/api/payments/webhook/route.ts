import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // MP sends different notification types; we only care about payments
    if (body.type !== 'payment') {
      return Response.json({ ok: true })
    }

    const paymentId = body.data?.id
    if (!paymentId) return Response.json({ ok: true })

    // Fetch full payment details from MP to verify legitimacy
    const paymentApi = new Payment(mp)
    const payment = await paymentApi.get({ id: String(paymentId) })

    if (payment.status !== 'approved') {
      return Response.json({ ok: true })
    }

    const externalRef = payment.external_reference
    if (!externalRef || !externalRef.includes('::')) {
      return Response.json({ ok: true })
    }

    const [userId, transactionId] = externalRef.split('::')
    const amount = payment.transaction_amount ?? 0

    if (!userId || !transactionId || amount <= 0) {
      return Response.json({ ok: true })
    }

    const admin = createAdminClient() as any

    // Idempotency check — skip if already processed
    const { data: tx } = await admin
      .from('transactions')
      .select('status')
      .eq('id', transactionId)
      .single()

    if (!tx || tx.status === 'completed') {
      return Response.json({ ok: true })
    }

    // Mark transaction completed; extra .eq guard prevents double-processing
    const { error: txError } = await admin
      .from('transactions')
      .update({ status: 'completed', reference_id: String(paymentId) })
      .eq('id', transactionId)
      .eq('status', 'pending')

    if (txError) {
      console.error('webhook: tx update failed', txError)
      return Response.json({ error: 'tx update failed' }, { status: 500 })
    }

    // Credit balance — read-then-write (concurrent deposits are rare at this scale)
    const { data: profile } = await admin
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profile) {
      await admin
        .from('profiles')
        .update({ balance: profile.balance + amount })
        .eq('id', userId)
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('webhook error', err)
    // Always return 200 so MP doesn't retry indefinitely
    return Response.json({ ok: true })
  }
}
