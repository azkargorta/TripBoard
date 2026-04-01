// FIXED TripMapView.tsx (safe google maps usage)

"use client";

import { useEffect } from "react";

export default function TripMapView({ isLoaded, visibleRoutes, setDirectionsMap, normalizeTravelMode }) {

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined" || !window.google?.maps) return;

    const gmMaps = window.google.maps;

    const routesForDirections = visibleRoutes.filter(
      (route) =>
        typeof route.origin_latitude === "number" &&
        typeof route.origin_longitude === "number" &&
        typeof route.destination_latitude === "number" &&
        typeof route.destination_longitude === "number"
    );

    if (!routesForDirections.length) {
      setDirectionsMap({});
      return;
    }

    let cancelled = false;
    const service = new gmMaps.DirectionsService();

    async function loadDirections() {
      const entries = await Promise.all(
        routesForDirections.map(async (route) => {
          try {
            const waypoints =
              typeof route.stop_latitude === "number" &&
              typeof route.stop_longitude === "number"
                ? [
                    {
                      location: {
                        lat: route.stop_latitude,
                        lng: route.stop_longitude,
                      },
                      stopover: true,
                    },
                  ]
                : [];

            const result = await service.route({
              origin: {
                lat: route.origin_latitude,
                lng: route.origin_longitude,
              },
              destination: {
                lat: route.destination_latitude,
                lng: route.destination_longitude,
              },
              travelMode: gmMaps.TravelMode[normalizeTravelMode(route.travel_mode)],
              waypoints,
              provideRouteAlternatives: false,
            });

            return [route.id, result];
          } catch (error) {
            console.error("Error calculando ruta", route.id, error);
            return [route.id, null];
          }
        })
      );

      if (cancelled) return;

      const next = {};
      entries.forEach(([id, result]) => {
        next[id] = result;
      });
      setDirectionsMap(next);
    }

    loadDirections();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, visibleRoutes]);

  return null;
}
