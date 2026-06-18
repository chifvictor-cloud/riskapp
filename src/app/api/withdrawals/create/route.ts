import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const amount = Number(body.amount)
  const recipient = String(body.recipient ?? '').trim().toLowerCase()

  if (!amount || amount < 50 || amount > 50000) {
    return Response.json({ error: 'Monto inválido (mínimo $50 MXN)' }, { status: 400 })
  }
  if (!recipient || !EMAIL_RE.test(recipient)) {
    return Response.json({ error: 'Ingresa un email de MercadoPago válido' }, { status: 400 })
  }

  // Atomic: verify balance, deduct, create pending tx — single DB transaction
  const { data: txId, error: rpcError } = await (supabase as any).rpc('process_withdrawal', {
    p_amount: amount,
    p_recipient: recipient,
  })

  if (rpcError) {
    if (rpcError.message.includes('insufficient_balance')) {
      return Response.json({ error: 'Balance insuficiente para realizar este retiro' }, { status: 400 })
    }
    console.error('[withdraw] rpc error:', rpcError)
    return Response.json({ error: 'Error al procesar el retiro' }, { status: 500 })
  }

  const admin = createAdminClient() as any

  try {
    const transferRes = await fetch('https://api.mercadopago.com/v1/account/transfer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': String(txId),
      },
      body: JSON.stringify({
        amount,
        currency_id: 'MXN',
        receiver: { email: recipient },
      }),
    })

    const transferData = await transferRes.json()
    console.log('[withdraw] MP response:', transferRes.status, JSON.stringify(transferData))

    if (!transferRes.ok) {
      await admin.rpc('refund_withdrawal', { p_tx_id: txId, p_user_id: user.id, p_amount: amount })
      const mpMessage = transferData?.message ?? transferData?.error ?? 'Error de MercadoPago'
      return Response.json(
        { error: `No se pudo completar la transferencia: ${mpMessage}` },
        { status: 400 },
      )
    }

    await admin
      .from('transactions')
      .update({ status: 'completed', reference_id: String(transferData.id ?? '') })
      .eq('id', txId)

    return Response.json({ ok: true, amount, recipient })

  } catch (err: any) {
    console.error('[withdraw] unexpected error:', err)
    await admin.rpc('refund_withdrawal', { p_tx_id: txId, p_user_id: user.id, p_amount: amount })
    return Response.json(
      { error: 'Error de conexión con MercadoPago. Tu balance ha sido reembolsado.' },
      { status: 500 },
    )
  }
}
