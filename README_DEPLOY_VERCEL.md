# TripBoard - despliegue limpio en Vercel

## Qué se ha limpiado
- Se ha eliminado `node_modules/`
- Se ha eliminado `.next/`
- Se ha eliminado `.env.local`
- Se ha eliminado `middleware.ts` / `middleware.ts.bak`
- Se ha dejado `app/page.tsx` mínimo para validar la home
- `app/api/document/analyze/route.ts` ya usa `runtime = "nodejs"`
- `app/api/expense/analyze/route.ts` ya usa `runtime = "nodejs"`
- `package.json` está fijado a Next 14.2.33 / React 18.3.1

## Qué tienes que hacer ahora
1. Sustituye tu repo por este contenido.
2. Ejecuta `npm install`.
3. Sube a GitHub.
4. En Vercel crea un proyecto nuevo o redeploy limpio.
5. Añade estas variables en Vercel (Production y Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `OCR_SPACE_API_KEY`
   - `OPENAI_API_KEY`
6. En Supabase > Authentication > URL Configuration:
   - Site URL: `https://TU-DOMINIO.vercel.app`
   - Redirect URLs:
     - `https://TU-DOMINIO.vercel.app/auth/callback`
     - `https://TU-DOMINIO.vercel.app/auth/recovery`
     - `https://TU-DOMINIO.vercel.app/auth/reset-password`
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/recovery`
     - `http://localhost:3000/auth/reset-password`

## Qué he desactivado temporalmente
- Middleware. Cuando la web cargue y login funcione, se puede reintroducir un middleware limpio.

## Comprobaciones tras desplegar
1. `/` debe abrir la home simple.
2. `/auth/login` debe cargar.
3. `/dashboard` debe cargar o redirigir según la lógica interna.
4. Si todo va bien, el siguiente paso es restaurar `app/page.tsx` y luego el middleware.
