import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export type VerifyResult =
  | { ok: true; credited: boolean; amount: number }
  | { ok: false; reason: string }

/**
 * Fetches payment from MP, validates it belongs to userId, and credits balance.
 * Idempotent — safe to call even if the webhook already ran.
 */
export async function verifyAndCredit(
  paymentId: string,
  userId: string,
): Promise<VerifyResult> {
  try {
    const paymentApi = new Payment(mp)
    const payment = await paymentApi.get({ id: paymentId })

    if (payment.status !== 'approved') {
      return { ok: false, reason: `payment_status:${payment.status}` }
    }

    const externalRef = payment.external_reference
    if (!externalRef || !externalRef.includes('::')) {
      return { ok: false, reason: 'invalid_external_reference' }
    }

    const [refUserId, transactionId] = externalRef.split('::')
    const amount = payment.transaction_amount ?? 0

    if (refUserId !== userId) {
      return { ok: false, reason: 'user_mismatch' }
    }

    if (!transactionId || amount <= 0) {
      return { ok: false, reason: 'invalid_amount_or_tx' }
    }

    const admin = createAdminClient() as any

    const { data: tx, error: txSelectError } = await admin
      .from('transactions')
      .select('status')
      .eq('id', transactionId)
      .single()

    if (txSelectError) {
      return { ok: false, reason: 'tx_not_found' }
    }

    if (tx?.status === 'completed') {
      return { ok: true, credited: false, amount }
    }

    const { error: txError } = await admin
      .from('transactions')
      .update({ status: 'completed', reference_id: String(paymentId) })
      .eq('id', transactionId)
      .eq('status', 'pending')

    if (txError) {
      return { ok: false, reason: 'tx_update_failed' }
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return { ok: false, reason: 'profile_not_found' }
    }

    const { error: balanceError } = await admin
      .from('profiles')
      .update({ balance: profile.balance + amount })
      .eq('id', userId)

    if (balanceError) {
      return { ok: false, reason: 'balance_update_failed' }
    }

    return { ok: true, credited: true, amount }
  } catch (err) {
    console.error('[verifyAndCredit] error:', err)
    return { ok: false, reason: 'unexpected_error' }
  }
}
