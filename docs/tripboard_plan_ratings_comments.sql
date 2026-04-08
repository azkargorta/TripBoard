-- Añade valoración (1..5) y comentarios a las actividades del plan.
-- Tabla: trip_activities

ALTER TABLE public.trip_activities
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS comment text;

-- Validación: rating debe ser 1..5 si existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trip_activities_rating_range'
  ) THEN
    ALTER TABLE public.trip_activities
      ADD CONSTRAINT trip_activities_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  END IF;
END $$;

