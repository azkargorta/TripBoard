# Smoke test del Mapa (TripBoard)

Objetivo: detectar regresiones del mapa rápido (2–5 min) antes de meter cambios nuevos.

## Preparación

- Tener un viaje con:
  - al menos 2 actividades en Plan con coordenadas (lat/lng)
  - al menos 1 ruta guardada (opcional, si no existe se crea en el test)
- Estar logueado (email o Google).

## Checklist rápido (Mapa v1)

### Carga y estabilidad

- Abrir `/trip/[id]/map`.
- Ver que:
  - carga el mapa (sin refrescos infinitos)
  - aparecen marcadores de Plan (si hay coordenadas)
  - aparecen rutas guardadas (si existen) dibujadas sobre carretera

### Filtro por día

- En el selector, elegir:
  - **Todos los días**
  - un **día concreto**
- Verificar:
  - la lista de rutas se filtra
  - el mapa refleja el filtro (menos rutas visibles)

### Crear ruta (Plan → ruta)

- Pulsar **Nueva ruta**.
- Seleccionar:
  - día (date)
  - hora de salida (time) (opcional)
  - modo (Coche/Andando/Transporte público/Bici)
  - origen desde **Plan**
  - destino desde **Plan**
- Pulsar **Calcular ruta** y verificar:
  - aparece resultado con distancia/duración (si Google Directions responde)
  - aparece una ruta “preview” dibujada en el mapa
- Pulsar **Guardar ruta** y verificar:
  - aparece en la lista de rutas
  - al recargar la página sigue existiendo

### Parada intermedia

- Activar **Parada intermedia**.
- Elegir una parada desde Plan o Buscar.
- Calcular y guardar.
- Verificar que la ruta se dibuja y queda guardada.

### Editar ruta

- En la lista de rutas, abrir una ruta guardada.
- Cambiar:
  - nombre
  - hora
  - color
  - modo
- Guardar cambios y verificar que persisten.

### Eliminar ruta

- Eliminar una ruta (no legacy).
- Verificar:
  - desaparece de la lista
  - desaparece del mapa
  - tras refrescar no vuelve a aparecer

### Abrir en Google Maps

- Pulsar **Abrir** en una ruta.
- Verificar que se abre Google Maps con origen/destino (y parada si aplica).

## Notas

- “Legacy”: las rutas provenientes de tablas antiguas se muestran como solo lectura.
- Si el cálculo falla, revisar `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` y que Directions API esté activa.

