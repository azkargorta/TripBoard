# Premium por viaje (premium compartido)

Este documento describe la lógica de **“premium efectivo por viaje”** usada en rutas API relacionadas con viajes.

## Objetivo (por qué)

Permitir que las funcionalidades premium **dentro de un viaje** se puedan usar si el viaje tiene al menos un participante premium, evitando fricción cuando un viaje se organiza en grupo (p. ej. una persona paga y el grupo colabora en el mismo viaje).

## Regla de entitlement (qué)

Un usuario se considera **premium dentro de un viaje** si se cumple cualquiera:

- **Usuario premium**: el usuario autenticado tiene `profiles.is_premium = true`.
- **Participante premium**: existe **al menos 1** participante del viaje (no `removed`) cuyo perfil es premium.

Si no se cumple ninguna, el usuario se considera **no premium** para ese viaje.

### Requisito de acceso (seguridad)

La comprobación está pensada para ejecutarse **solo si el usuario ya tiene acceso al viaje** (es participante). En caso contrario, por RLS o falta de permisos, la comprobación puede devolver `false`.

## Códigos de error esperados

- **401**: no autenticado / no hay sesión.
- **403**: el usuario no es participante del viaje (no tiene acceso).
- **402**: el usuario tiene acceso al viaje pero **no** cumple premium (ni él ni ningún participante premium).

Para **402** se recomienda incluir `code: "PREMIUM_REQUIRED"` en el payload JSON.

## Alcance actual (rutas que lo aplican)

Ejemplos donde se usa la regla “premium por viaje”:

- `app/api/trip-ai/*` (IA asociada a un viaje)
- `app/api/route-tolls` (cálculo de peajes/rutas con APIs de pago)
- `app/api/geocode` cuando se pasa `tripId`
- `app/api/trip-routes` (degradación de datos en plan gratuito; no bloquea creación)

La lista exacta puede cambiar; busca usos de `isPremiumEnabledForTrip`.

## Notas de compatibilidad

- **Comportamiento anterior**: algunas rutas podían exigir premium “del usuario” incluso dentro de un viaje.
- **Comportamiento nuevo**: dentro de un viaje, premium puede ser “compartido” si hay un participante premium.
- **Fuera de un viaje** (sin `tripId`): se mantiene, en general, premium del usuario.

## Test plan (manual)

- [ ] Usuario premium accede a una ruta premium del viaje → **200**
- [ ] Usuario NO premium, pero el viaje tiene participante premium → **200**
- [ ] Ningún participante premium → **402** con `code: "PREMIUM_REQUIRED"`
- [ ] Usuario autenticado pero NO participante del viaje → **403**
- [ ] Sin sesión → **401**

