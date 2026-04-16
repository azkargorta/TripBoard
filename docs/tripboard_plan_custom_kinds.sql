-- Tipos personalizados de planes (por viaje)
--
-- Permite definir un catálogo de tipos (label/emoji/color) reutilizable
-- para el Plan y el Mapa, sin depender de que exista ya un plan con ese tipo.

CREATE TABLE IF NOT EXISTS public.trip_activity_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind_key text NOT NULL,       -- clave normalizada (ej. "playa", "senderismo")
  label text NOT NULL,          -- etiqueta visible (ej. "Playa")
  emoji text NULL,              -- ej. "🏖️"
  color text NULL,              -- ej. "#a855f7"
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_activity_kinds_unique_key_per_trip'
  ) THEN
    ALTER TABLE public.trip_activity_kinds
      ADD CONSTRAINT trip_activity_kinds_unique_key_per_trip UNIQUE (trip_id, kind_key);
  END IF;
END $$;

-- RLS: mismo patrón que otras tablas del viaje (si ya tienes policies por trip_id)
ALTER TABLE public.trip_activity_kinds ENABLE ROW LEVEL SECURITY;

-- Lectura: participantes del viaje
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trip_activity_kinds' AND policyname='trip_activity_kinds_select') THEN
    CREATE POLICY trip_activity_kinds_select
      ON public.trip_activity_kinds
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.trip_participants tp
        WHERE tp.trip_id = trip_activity_kinds.trip_id
          AND tp.user_id = auth.uid()
      ));
  END IF;
END $$;

-- Escritura: no viewers (owner/editor)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trip_activity_kinds' AND policyname='trip_activity_kinds_write') THEN
    CREATE POLICY trip_activity_kinds_write
      ON public.trip_activity_kinds
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.trip_participants tp
        WHERE tp.trip_id = trip_activity_kinds.trip_id
          AND tp.user_id = auth.uid()
          AND tp.role <> 'viewer'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.trip_participants tp
        WHERE tp.trip_id = trip_activity_kinds.trip_id
          AND tp.user_id = auth.uid()
          AND tp.role <> 'viewer'
      ));
  END IF;
END $$;

