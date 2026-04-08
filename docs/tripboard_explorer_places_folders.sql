-- Carpetas y lugares guardados (Explorador)

-- Carpetas por viaje
CREATE TABLE IF NOT EXISTS public.trip_place_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NULL,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lugares guardados (por Google place_id)
CREATE TABLE IF NOT EXISTS public.trip_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  folder_id uuid NULL REFERENCES public.trip_place_folders(id) ON DELETE SET NULL,
  place_id text NULL,
  name text NOT NULL,
  address text NULL,
  latitude double precision NULL,
  longitude double precision NULL,
  category text NULL, -- visit|museum|restaurant|activity|transport|lodging|other
  notes text NULL,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un mismo place_id no debería duplicarse dentro del mismo viaje
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_places_unique_place_per_trip'
  ) THEN
    ALTER TABLE public.trip_places
      ADD CONSTRAINT trip_places_unique_place_per_trip UNIQUE (trip_id, place_id);
  END IF;
END $$;

