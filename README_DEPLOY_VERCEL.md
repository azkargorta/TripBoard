# Kaviro - despliegue limpio en Vercel

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
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID_MONTHLY`
   - `STRIPE_PRICE_ID_YEARLY`
   - `OCR_SPACE_API_KEY`
   - `AI_PROVIDER` (opcional; por defecto `gemini`)
   - `GEMINI_API_KEY` (si usas IA con Gemini)
   - `GEMINI_MODEL` (opcional)
   - `AI_USER_MONTHLY_BUDGET_EUR` (opcional)
   - `AI_ENHANCE_ANALYSIS` (opcional)
   - `NEXT_PUBLIC_APP_URL` (recomendado)
   - `TRIPBOARD_ADMIN_EMAILS` (opcional)
6. En Supabase > Authentication > URL Configuration:
   - Site URL: `https://TU-DOMINIO.vercel.app`
   - Redirect URLs:
     - `https://TU-DOMINIO.vercel.app/auth/callback` (Google OAuth y PKCE por correo si aplica)
     - `https://TU-DOMINIO.vercel.app/auth/recovery`
     - `https://TU-DOMINIO.vercel.app/auth/reset-password`
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/recovery`
     - `http://localhost:3000/auth/reset-password`
     - `https://TU-DOMINIO.vercel.app/auth/verify`
     - `http://localhost:3000/auth/verify`

7. **Recuperación de contraseña (importante):** en Supabase → **Authentication → Email templates** → **Reset password**, sustituye el enlace del botón por uno que use `token_hash` (no depende de PKCE ni del mismo navegador). Ejemplo:

   ```html
   <a href="{{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=recovery">Restablecer contraseña</a>
   ```

   Sin este cambio, el correo seguirá llevando el flujo antiguo (`?code=` + PKCE) y verás errores de verificador.

8. **Confirmar registro (crear cuenta):** en **Email templates** → **Confirm signup**, sustituye `{{ .ConfirmationURL }}` por un enlace con `token_hash` (evita quedarse en «Validando enlace…» en `/auth/callback`). Ejemplo:

   ```html
   <a href="{{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=signup">Confirmar cuenta</a>
   ```

## Middleware
- Hay `middleware.ts` en la raíz limitado a rutas `/auth/*` para refrescar cookies de Supabase (necesario tras `/auth/verify` y para que `updateUser` en reset no se quede colgado).

## Comprobaciones tras desplegar
1. `/` debe abrir la home simple.
2. `/auth/login` debe cargar.
3. `/dashboard` debe cargar o redirigir según la lógica interna.
4. Si todo va bien, el siguiente paso es restaurar `app/page.tsx` y luego el middleware.
