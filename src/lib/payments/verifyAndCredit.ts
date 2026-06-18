import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })

export type VerifyResult =
  | { ok: true; credited: boolean; amount: number; debug: VerifyDebug }
  | { ok: false; reason: string; debug: VerifyDebug }

export type VerifyDebug = {
  paymentId: string
  userId: string
  mpStatus: string | null
  mpExternalRef: string | null
  mpAmount: number | null
  txStatus: string | null
  step: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function verifyAndCredit(
  paymentId: string,
  userId: string,
): Promise<VerifyResult> {
  const debug: VerifyDebug = {
    paymentId,
    userId,
    mpStatus: null,
    mpExternalRef: null,
    mpAmount: null,
    txStatus: null,
    step: 'init',
  }

  try {
    debug.step = 'fetching_mp_payment'
    const paymentApi = new Payment(mp)
    const payment = await paymentApi.get({ id: paymentId })

    debug.mpStatus = payment.status ?? null
    debug.mpExternalRef = payment.external_reference ?? null
    debug.mpAmount = payment.transaction_amount ?? null
    debug.step = 'mp_fetched'

    if (payment.status !== 'approved') {
      return { ok: false, reason: `payment_status:${payment.status}`, debug }
    }

    const externalRef = payment.external_reference
    if (!externalRef || !externalRef.includes('::')) {
      debug.step = 'invalid_external_reference'
      return { ok: false, reason: 'invalid_external_reference', debug }
    }

    const [refUserId, transactionId] = externalRef.split('::')
    const amount = payment.transaction_amount ?? 0

    if (refUserId !== userId) {
      debug.step = 'user_mismatch'
      return { ok: false, reason: 'user_mismatch', debug }
    }

    if (!transactionId || amount <= 0) {
      debug.step = 'invalid_amount_or_tx'
      return { ok: false, reason: 'invalid_amount_or_tx', debug }
    }

    if (!UUID_RE.test(transactionId)) {
      debug.step = `invalid_tx_uuid: ${transactionId}`
      return { ok: false, reason: 'invalid_tx_uuid', debug }
    }

    const admin = createAdminClient() as any

    // Idempotency: if this MP payment was already credited, don't double-credit
    debug.step = 'checking_idempotency'
    const { data: existingTx } = await admin
      .from('transactions')
      .select('status')
      .eq('mp_payment_id', paymentId)
      .maybeSingle()

    if (existingTx?.status === 'completed') {
      debug.txStatus = 'completed'
      debug.step = 'already_completed'
      return { ok: true, credited: false, amount, debug }
    }

    debug.step = 'checking_tx'
    const { data: tx, error: txSelectError } = await admin
      .from('transactions')
      .select('status')
      .eq('id', transactionId)
      .single()

    if (txSelectError) {
      debug.step = `tx_select_error: ${txSelectError.message}`
      return { ok: false, reason: 'tx_not_found', debug }
    }

    debug.txStatus = tx?.status ?? null
    debug.step = 'tx_found'

    if (tx?.status === 'completed') {
      debug.step = 'already_completed'
      return { ok: true, credited: false, amount, debug }
    }

    debug.step = 'updating_tx'
    const { error: txError } = await admin
      .from('transactions')
      .update({ status: 'completed', mp_payment_id: paymentId })
      .eq('id', transactionId)
      .eq('status', 'pending')

    if (txError) {
      debug.step = `tx_update_error: ${txError.message}`
      return { ok: false, reason: 'tx_update_failed', debug }
    }

    debug.step = 'fetching_profile'
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      debug.step = `profile_error: ${profileError?.message}`
      return { ok: false, reason: 'profile_not_found', debug }
    }

    debug.step = 'updating_balance'
    const { error: balanceError } = await admin
      .from('profiles')
      .update({ balance: profile.balance + amount })
      .eq('id', userId)

    if (balanceError) {
      debug.step = `balance_error: ${balanceError.message}`
      return { ok: false, reason: 'balance_update_failed', debug }
    }

    debug.step = 'done'
    return { ok: true, credited: true, amount, debug }
  } catch (err: any) {
    debug.step = `exception: ${err?.message ?? String(err)}`
    console.error('[verifyAndCredit] error:', err)
    return { ok: false, reason: 'unexpected_error', debug }
  }
}
