<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RISK — Contexto para Claude Code

Este archivo lo lees al inicio de cada sesión. Contiene el estado del proyecto, las reglas de trabajo y el contexto técnico. **Léelo completo antes de proponer cambios.**

---

## Qué es RISK

Plataforma de torneos 1v1 de Fortnite con dinero real y apuestas de espectadores (pari-mutuel). Solo dev: Victor (XHIF), desde México.

- **Stack:** Next.js + TypeScript + Tailwind, Supabase (PostgreSQL), MercadoPago, Vercel.
- **Repo:** `chifvictor-cloud/riskapp`
- **Deploy:** `riskapp-seven.vercel.app`
- **Ruta local:** `C:\Users\USER\Desktop\risk-app`

---

## Reglas de trabajo (NO negociables)

1. **Una capa a la vez.** Validar antes de avanzar a la siguiente. Ideas nuevas a mitad de sesión → van al backlog, no a la cola de build.
2. **Nunca auto-commit.** Siempre mostrar el diff completo antes de commit/push, especialmente si toca puntos, balance o dinero real.
3. **Código (.tsx/.ts) lo haces tú (Claude Code)** → commit + push a `chifvictor-cloud/riskapp`.
4. **SQL lo corre Victor manualmente** en el SQL Editor de Supabase. Nunca vía CLI, nunca automatizado. Tú preparas el SQL, él lo revisa y lo ejecuta.
5. **Nunca UUIDs a mano en SQL.** Siempre subquery por email: `select id from auth.users where email='...'`.
6. **Si Victor abre una feature nueva antes de terminar la actual, redirígelo.** Es un patrón conocido. Recuérdale qué está en curso.
7. **Comunicación en español mexicano casual, directa, sin adornos.**

---

### En curso
**Nada activo.** M1 (marcos evolutivos) COMPLETADO el 13-jul, sin pendientes — ver "Completado". Siguiente capa: decidir del backlog con Victor.

**Ideas apuntadas (post-M1, ya se pueden discutir):**
- Marcos épicos animados (fuego, electricidad, sombras) para tiers altos — genera FOMO, el flex ajeno vende. No es CSS simple: requiere Lottie/SVG animado/canvas, con cuidado de performance en celular. Va con el rediseño Stitch (#9). El CSS actual es placeholder funcional a propósito.
- Tier 0 novato (Bronze pasa a ser 1ra meta) — evaluar.
- Regenerar `types/database.ts` contra DB viva (v15–v19) — deuda técnica, sin prisa; por eso abunda `(supabase as any)`.
- M2 (foto de perfil): decisiones ya tomadas — moderación reactiva para beta, bucket de Storage con límite de tamaño + jpg/png.

### Completado y validado en producción
- **Pari-mutuel (v10–v13, Capas 1–3C):** tabla `match_bets`, funciones `place_bet` / `resolve_bets` / `refund_bets`, ventana de 90s vía `betting_closes_at`, rake 5%, payout proporcional, reembolso completo si no hay ganador o se cancela. Modelo de fixed-odds descartado explícitamente.
- **Capa 3A/3B/3C:** panel de apuestas en SpectateRoom (pot, odds, countdown, quick-bet), función `get_my_bets()`, componente `MisApuestas.tsx`. Fix: apuestas `refunded` ahora muestran `cancelada`.
- **Live betting por rondas (v13, Capa 2, cerrada 3-jul):** tabla `bet_rounds`, función `open_bet_round`, `resolve_bets_internal` multi-pool, banner "¡NUEVA RONDA DE APUESTAS!" con Web Audio API + flash naranja + animaciones. Guard `players_cannot_bet`. Fix de doble conteo de apuesta propia en pot (early return en INSERT de realtime si `bet.user_id === userId`).

- **"Mis apuestas" tab global:** ruta `/mis-apuestas` (server component con login requerido) + link en Navbar (desktop y móvil) + componente autocontenido `MisApuestas.tsx` (llama `get_my_bets()` él solo, sin props) reusado como sección colapsable en SpectateRoom. Ojo: muestra TODAS las apuestas del usuario en ambos montajes, no filtra por match.
- **Moderador Capa 4.1 (v14, cerrada 4-jul):** tabla `match_moderators`, funciones `propose_moderator` / `accept_moderator`, card en MatchRoom con realtime, badge en SpectateRoom, guard `mods_cannot_bet`.
- **Referral R1 (v15, cerrada 5-jul):** `referral_code`, `referred_by`, `referral_qualified` en profiles; `make_partner(email)` (solo desde SQL Editor); `attribute_referral(code)` con guard de <48h; `get_my_referral_stats()`; `ReferralTracker.tsx` global + `PartnerPanel.tsx` en Dashboard. Código de partner de Victor: `xhif444`. Validado end-to-end.
- **Fix crítico de registro:** trigger `handle_new_user` reescrito con `lower() + regexp_replace('[^a-z0-9_]', '', 'g')` + loop de unicidad. Nuevos registros arrancan en 0 pts / 0 balance (sin welcome bonus, decisión de Victor). Confirmación de email sigue activa (anti-bot).
- **Auditoría de seguridad Fases 1–2 (v16–v18, cerrada 5-jul):** 6 vulnerabilidades reales parchadas (profiles auto-update de balance/is_admin; INSERT directo en `match_bets` saltándose `place_bet`; `resolve_bets_internal` ejecutable públicamente; `report_match_result` muerto pero callable; `add_points` público; `make_partner` público). `search_path` endurecido en 8 funciones SECURITY DEFINER. Migración v17 (918 líneas, idempotente) versiona todo el SQL previo en repo. `reportMatchResult` server action eliminado; todo el flujo de resultado ahora va por `submit_match_result` con doble confirmación.
- **Marcos evolutivos M1 (v19, cerrada 13-jul):** catálogo `frame_tiers` (5 tiers Bronze→Legendary; umbrales 0/5/20/50/150 victorias; precios 1,500/5,000/15,000 pts, ajustables con UPDATE; Bronze y Legendary NO comprables); columnas `frame_tier`/`frame_unlocked_via` en profiles; `recalculate_frame_tier` + trigger `matches_frame_tier_on_completed` (sube tier al ganar, solo sube); `buy_frame_tier(p_target_tier)` SECURITY DEFINER que devuelve jsonb con `error`/`success` (NO lanza excepción, a diferencia de `redeem_product`). Componente `PlayerFrame.tsx` (clase `player-frame-tier-{1..5}`, CSS placeholder). Integrado en SpectateRoom, MatchRoom, Dashboard, perfil (hero) y ranking — en ranking solo en filas de rank 4+; el podio y el top-3 de las filas conservan el color de medalla SIN marco a propósito (ahí el color comunica rank, no tier). Tienda de marcos en `/store`: `FrameShop.tsx` + server action `buyFrameTier` en `store/actions.ts`, con confirmación previa mostrando balance resultante. Compra validada en producción. La DB permite saltar tiers (Bronze→Gold directo pagando solo Gold). Formato de puntos unificado en toda `/store` vía `formatPts` en `lib/format.ts` (locale `es-MX` fijo; sin él, locale `es` pinta 4 dígitos sin separador y 5 con punto). De pilón: fix del podio del ranking, colores y alturas se indexaban por posición visual en vez de rank (el #1 salía plateado y con columna baja).

### Pendiente de validar
- Flujo completo de betting + rondas con amigos reales (`gabscmplus`, `schavez090805`, `andresemiliano70`) observando comprensión de UI sin explicación.

---

## Backlog (en orden, una a la vez)

2. Sponsor (#3)
3. Parlays (combinadas multi-match, verificación ya resuelta).
4. Rol de streamer/mod + eventos verificados por stream en vivo — **desbloqueador** de #5.
5. Mercados SÍ/NO de jugadas específicas (primer kill, primer shotgun, etc.) — **bloqueado** hasta #4.
6. ~~Marcos evolutivos M1~~ ✅ (cerrada 13-jul). M2 (foto) después.
7. Loot boxes (después de M1+M2).
8. Sonido "cha-ching" al ganar apuesta (mini-capa cosmética).
9. Rediseño visual con Stitch — pantalla por pantalla, empezando por vista de espectador, definir lenguaje visual primero, **después** de validar con usuarios reales.
10. **LARGO PLAZO, requiere abogado primero:** suscripción premium con cash-out (puntos → dinero). Riesgo regulatorio serio (SEGOB / Ley de Juegos y Sorteos, fiscal, políticas de payout de MercadoPago; puntos se vuelven pasivo). **No construir sin abogado.**

### Descartado
- Fixed-odds (plataforma cubre pérdidas).
- Tick automático de rondas por tiempo.

### Cosmético transversal
Victor quiere animaciones visuales espectaculares en momentos clave — efectos "dopamine" optimizados para clips de TikTok. No es una capa, se aplica en todas.

---

## Capa 4.2 (siguiente en moderador, diseño ya acordado)

**Consentimiento del mod (primera tarea de 4.2):**
- Tercera firma: `proposed → awaiting_mod → active`.
- Función `mod_accept_role()` con accept/reject por el propio mod.
- Guard `mods_cannot_bet` aplica solo a mods `active`.

**Resto de 4.2:**
- Tabla `match_events` + catálogo de botones del mod + feed en realtime.

**Diseño completo de Capa 4 (para referencia):**
- Un solo marcador + backups con veto.
- Jerarquía de verdad: 2 jugadores de acuerdo > mod → red flag.
- Buffer de 5s "calculando ganancia" antes de pintar payouts.
- Modo sin-mod = flujo actual + auto-refund de apuestas en disputa larga (el match/premio NO se auto-cancela, espera admin).
- Reputation score del mod con freeze silencioso por patrones.
- Reversibilidad de admin como último recurso.
- Streamer = mod con permisos extra (abrir rondas/mercados).

---

## Bugs conocidos

- **Bets huérfanas** si se borra un match sin CASCADE en el FK de `match_bets`. Antes de cualquier feature de borrar match: agregar CASCADE o llamar `refund_bets` primero.
- **Countdown ~96s** por skew de reloj cliente/servidor. El servidor valida el close time real; es solo visual.

---

## Pendiente técnico

- **Apuestas "abiertas" zombis:** hay apuestas en estado `abierta` desde el 3-jul-2026 de matches que nunca se resolvieron (4 en la cuenta de prueba, detectadas 13-jul). Revisar si es solo data de pruebas o si falta un camino de resolución/limpieza para matches abandonados (ni completed ni cancelled → nunca corre `resolve_bets` ni `refund_bets`). Relacionado con el diseño de Capa 4 (auto-refund en disputa larga), pero eso solo cubre disputas, no abandono.

---

## Auditoría pendiente (no urgente, no aplicar sin probar frontend)

**Fase 3:**
- HMAC signature para webhook de MercadoPago.
- Crédito atómico de balance (prevenir doble crédito en reintentos de MP).
- PII logging en webhook.

**Fase 4:**
- Tabla `audit_log`.
- Rate limiting en funciones que mueven dinero.
- Validaciones extra en `place_bet` (límite horario, cap de exposición).

**Baja severidad:**
- H3: grants de TRUNCATE/TRIGGER a anon/authenticated.
- H4: policy de INSERT en profiles sin `WITH CHECK`.

---

## Pipeline de pagos pendiente

- **R1.5:** hook para que un depósito aprobado de MercadoPago marque `referral_qualified=true`. Victor debe confirmar cómo se registran hoy los depósitos aprobados (tabla / función / webhook).
- **R2:** comisiones de partners (50% del rake de referidos, 60% para founding partners), con ledger auditable. Atribución ya se registra retroactivamente.
- **R3:** dashboard completo de partner.

---

## Cuentas de prueba

- `xhif444@gmail.com` (main, laptop)
- `varelavic36@gmail.com` (celular)
- `chifvictor@gmail.com` (mastroll, incógnito)

Balances de puntos fueron inyectados por SQL para pruebas — considerar limpiar antes de validar con usuarios reales.

---

## Cómo trabajar en cada sesión

1. Abrir Claude Code: PowerShell → `cd C:\Users\USER\Desktop\risk-app` → `claude`.
2. Confirmar qué capa está en curso (ver "Estado actual" arriba).
3. Si Victor propone algo nuevo que no es la capa en curso → recordarle y ofrecer agregarlo al backlog.
4. Todo cambio de código: mostrar diff completo → esperar OK → commit + push.
5. Todo SQL: preparar migración → mostrar → Victor la corre en Supabase SQL Editor.
6. Al cerrar una capa: actualizar este archivo (mover a "Completado", limpiar "En curso").
