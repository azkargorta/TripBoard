# Guía rápida: mensajes de commit

Esta guía busca que los commits sean fáciles de revisar y de rastrear.

## Título

- **Corto y específico**: idealmente 50–72 caracteres.
- **Orientado a intención**: qué cambia el comportamiento, no detalles de implementación.

Ejemplos:

- `api: premium por viaje en rutas de trip`
- `entitlements: permitir premium compartido por participantes`

## Cuerpo

Incluye 2–6 bullets con foco en:

- **Por qué**: qué problema/flujo se mejora y para quién.
- **Reglas**: criterios de negocio (p. ej. quién pasa/falla).
- **Compatibilidad**: qué cambia respecto al comportamiento anterior.
- **Seguridad**: supuestos (p. ej. “solo si el usuario ya tiene acceso al viaje”).

## Errores y estados

Cuando el commit toca API, documenta brevemente:

- **códigos HTTP** esperados (401/403/402…)
- **payload** de error, especialmente `code` (p. ej. `PREMIUM_REQUIRED`)

## Test plan

Añade un bloque final:

```text
## Test plan
- [ ] Caso feliz (premium)
- [ ] Caso compartido (participante premium)
- [ ] No premium (402)
- [ ] Sin acceso (403)
- [ ] Sin sesión (401)
```

