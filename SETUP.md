# RISK — Setup Guide

## 1. Crear proyecto en Supabase

1. Ve a https://supabase.com y crea un proyecto nuevo
2. Copia las credenciales del proyecto (Settings → API):
   - `Project URL`
   - `anon public` key

## 2. Configurar variables de entorno

Edita `.env.local` con tus credenciales reales:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

## 3. Ejecutar el schema SQL

1. En Supabase, ve a **SQL Editor**
2. Pega el contenido de `supabase/schema.sql`
3. Ejecuta el script

## 4. Habilitar autenticación con Google (opcional)

1. En Supabase → Authentication → Providers → Google
2. Activa Google y agrega tus credenciales OAuth de Google Cloud Console
3. Agrega como Authorized redirect URI:
   `https://<tu-proyecto>.supabase.co/auth/v1/callback`

## 5. Ejecutar el proyecto

```bash
npm run dev
```

Abre http://localhost:3000

## Estructura del proyecto

```
src/
  app/
    page.tsx              — Landing page
    auth/
      login/page.tsx      — Inicio de sesión
      register/page.tsx   — Registro
      callback/route.ts   — OAuth callback
    dashboard/page.tsx    — Dashboard usuario
    tournaments/page.tsx  — Lista de torneos
  components/
    Navbar.tsx            — Navegación
    TournamentCard.tsx    — Tarjeta de torneo
  lib/supabase/
    client.ts             — Cliente browser
    server.ts             — Cliente servidor
  types/
    database.ts           — Tipos TypeScript
  middleware.ts           — Protección de rutas
supabase/
  schema.sql              — Schema completo de BD
```
