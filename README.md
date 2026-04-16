# Kaviro (TripBoard)

Kaviro es una web app para **organizar viajes en grupo**: plan/itinerario, mapa + rutas, gastos + balances, documentos/recursos, participantes y (en Premium) IA + análisis de documentos.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Supabase** (Auth + DB + Storage)
- **Stripe** (suscripciones Premium)
- **Mapas**: OpenStreetMap + Leaflet + OSRM + Photon (Komoot)
- **IA**: Gemini (y opción local con Ollama)
- **OCR**: OCR.Space (opcional)

## Rutas importantes

- Landing pública: `/`
- Precios: `/pricing`
- Acceso: `/auth/login`, `/auth/register`
- Dashboard: `/dashboard`
- Cuenta/Premium: `/account`

## Local: cómo arrancar

1) Instala dependencias

```bash
npm install
```

2) Crea tu `.env.local` (usa `.env.example` como base)

3) Arranca dev server

```bash
npm run dev
```

## Scripts

- `npm run dev`: desarrollo
- `npm run build`: build
- `npm run start`: producción local
- `npm run typecheck`: TypeScript sin emitir
- `npm test`: tests unitarios (vitest)

## Variables de entorno

Consulta `.env.example`. Mínimo para que la app funcione:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- (Opcional) Stripe/Premium: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`
- (Opcional) IA: `AI_PROVIDER`, `GEMINI_API_KEY`
- (Opcional) OCR: `OCR_SPACE_API_KEY`

## Precios mostrados en la UI

- Premium mensual: **3,99€ / mes**
- Premium anual: **39,99€ / año**

Nota: el cobro real lo determina Stripe (Price IDs).

## CI

Hay workflow de GitHub Actions en `.github/workflows/ci.yml` que ejecuta `typecheck` y `test`.

## Despliegue (Vercel)

Revisa `README_DEPLOY_VERCEL.md` para configuración de Supabase (URLs de redirect) y variables.

