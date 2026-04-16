# Auditoría TripBoard / Kaviro (2026-04-16)

Este documento guarda la auditoría del producto y sirve como checklist de mejora continua.

## Artefactos de referencia

- Canvas (visual): `c:\Users\azkargorta.unai\.cursor\projects\c-Users-azkargorta-unai-TripBoard\canvases\tripboard-auditoria.canvas.tsx`

## Veredicto (resumen)

La app está por encima de un MVP: cubre el ciclo completo de un viaje en grupo (plan, mapa/rutas, gastos, documentos, participantes, compartir) con una base técnica potente (Next.js + Supabase + Stripe + IA/OCR + mapas abiertos).

Lo que más limita el crecimiento ahora mismo no es “más features”, sino:

- **Coherencia**: reglas y mensajes de free/premium dispersos o contradictorios.
- **Madurez operativa**: CI, lint/typecheck, tests de integración/E2E y observabilidad.
- **Permisos**: existen permisos finos por módulo (`can_manage_*`), pero no se aplican de forma homogénea en APIs y UI.

## Puntos fuertes (pros)

- **Propuesta de valor completa**: organizar un viaje de principio a fin dentro de la misma app.
- **Uso grupal bien resuelto**: participantes, roles, invitaciones, balances; premium “por viaje” puede reducir fricción.
- **Módulos diferenciales**:
  - `Mapa + rutas`: herramientas útiles (previsualización, foco, ordenación, filtros).
  - `Gastos`: splits, balances, export, historial; alto potencial de retención.
- **Integraciones bien elegidas**: Supabase y Stripe para acelerar, mapas abiertos para reducir coste, IA/OCR como “upgrade”.

## Debilidades (contras)

- **Free/premium inconsistente**: copy, navegación y algunos endpoints no cuentan una historia única.
- **Conversión “antes del login”**: falta landing/pricing pública potente (funnel empieza demasiado pronto en login).
- **Permisos finos a medio implementar**: endpoints que solo miran `role` (viewer/editor/owner) sin `can_manage_*`.
- **Calidad/Proceso**: falta CI visible, scripts estándar de lint/typecheck, más pruebas de integración/E2E, README canónico.
- **Branding/naming**: convivencia TripBoard/Kaviro puede generar incoherencia en UI/comunicación.

## Qué falta para subir de nivel

- **Unificar paywall y mensajes**: una sola fuente de verdad para “qué incluye gratis” vs “qué desbloquea premium”.
- **Landing/pricing pública**: explicar valor, beneficios y comparativa, sin forzar login.
- **Onboarding guiado persistente**: checklist por viaje con progreso (crear viaje → invitar → plan → mapa → gastos).
- **Centro de ayuda/feedback**: FAQ, soporte, reporte de errores; especialmente para IA/OCR.
- **Observabilidad + rate limiting**: en share público, IA/OCR y servicios públicos (Photon/OSRM).
- **Tests de flujos críticos**: auth, upgrade, compartir, rutas, OCR, IA, creación/edición.

## Prioridades recomendadas (orden)

### P0 (impacto alto, desbloquea lo demás)

1) **Unificar reglas y mensajes de free/premium**
- Objetivo: coherencia total en UI, navegación y endpoints.
- Resultado esperado: menos confusión, menos tickets, mejor conversión.

2) **Permisos por módulo homogéneos**
- Objetivo: aplicar `can_manage_*` en endpoints y UI donde corresponda.
- Resultado esperado: menos inconsistencias y menos riesgos de seguridad funcional.

### P1 (crecimiento + estabilidad)

3) **Landing/pricing pública**
4) **CI + lint/typecheck + tests de integración/E2E básicos**
5) **Centralizar auditoría y helpers de acceso/autorización**

## Checklist (vamos “una a una”)

- [ ] P0: Unificar free/premium (gating + copy + navegación)
- [ ] P0: Permisos por módulo en endpoints + UI (`can_manage_*`)
- [ ] P1: Landing/pricing pública
- [ ] P1: CI/lint/typecheck + tests
- [ ] P1: Centralización helpers (access/audit)

