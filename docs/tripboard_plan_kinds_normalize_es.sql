-- Normaliza tipos existentes (catálogo + actividades) a:
-- - Nombres en castellano para los tipos base
-- - Formato: Primera mayúscula + resto minúsculas (sentence case)
--
-- Ejecutar en Supabase SQL editor.

-- 1) Catálogo de tipos por viaje (trip_activity_kinds)
--    - Fuerza labels en castellano para claves base
--    - Para el resto, normaliza sentence case
UPDATE public.trip_activity_kinds
SET label = CASE lower(kind_key)
  WHEN 'visit' THEN 'Visita'
  WHEN 'museum' THEN 'Museo'
  WHEN 'restaurant' THEN 'Restaurante'
  WHEN 'transport' THEN 'Transporte'
  WHEN 'activity' THEN 'Actividad'
  WHEN 'lodging' THEN 'Alojamiento'
  ELSE
    CASE
      WHEN label IS NULL OR btrim(label) = '' THEN
        upper(left(lower(kind_key), 1)) || substr(lower(kind_key), 2)
      ELSE
        upper(left(lower(label), 1)) || substr(lower(label), 2)
    END
END,
updated_at = now()
WHERE true;

-- 2) Actividades existentes (trip_activities)
--    Nota: aquí normalizamos activity_kind a la "key" canónica (inglés) para los tipos base,
--    porque el sistema usa activity_kind como clave. El label visible lo da el catálogo / UI.
--    También corregimos variantes en castellano comunes.
UPDATE public.trip_activities
SET activity_kind = CASE
  -- Alojamiento: por tipo o por kind
  WHEN lower(coalesce(activity_type, '')) = 'lodging' THEN 'lodging'
  WHEN lower(coalesce(activity_kind, '')) IN ('alojamiento','hotel','hospedaje','lodging') THEN 'lodging'

  -- Tipos base (acepta variantes)
  WHEN lower(coalesce(activity_kind, '')) IN ('visita','visit') THEN 'visit'
  WHEN lower(coalesce(activity_kind, '')) IN ('museo','museum') THEN 'museum'
  WHEN lower(coalesce(activity_kind, '')) IN ('restaurante','comida','restaurant') THEN 'restaurant'
  WHEN lower(coalesce(activity_kind, '')) IN ('transporte','transport') THEN 'transport'
  WHEN lower(coalesce(activity_kind, '')) IN ('actividad','activity') THEN 'activity'

  -- Si ya era otra cosa, lo dejamos tal cual (tipos personalizados existentes).
  ELSE activity_kind
END
WHERE activity_kind IS NOT NULL OR activity_type IS NOT NULL;

-- 3) Opcional: si quieres que tipos personalizados existentes en actividades
--    queden también con "key" normalizada (sin espacios/acentos raros),
--    esto es más agresivo. Se deja comentado.
-- UPDATE public.trip_activities
-- SET activity_kind = regexp_replace(lower(btrim(activity_kind)), '\s+', '_', 'g')
-- WHERE activity_kind IS NOT NULL
--   AND lower(activity_kind) NOT IN ('visit','museum','restaurant','transport','activity','lodging');

