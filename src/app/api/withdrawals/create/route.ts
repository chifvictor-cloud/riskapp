import { createClient } from '@/lib/supabase/server'

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

  // Deduct balance + create pending withdrawal in one atomic DB transaction
  const { error: rpcError } = await (supabase as any).rpc('process_withdrawal', {
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

  return Response.json({ ok: true, amount, recipient })
}
