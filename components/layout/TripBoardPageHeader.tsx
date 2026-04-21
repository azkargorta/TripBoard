"use client";

import { useEffect } from "react";
import { useTripBoardHeader, type TripBoardHeaderConfig } from "@/components/layout/TripBoardHeaderContext";

export default function TripBoardPageHeader(props: TripBoardHeaderConfig) {
  const { setHeader } = useTripBoardHeader();

  useEffect(() => {
    setHeader(props);
    // Importante: no limpiamos el header en unmount.
    // En transiciones entre páginas del mismo layout, limpiarlo provoca un “flash” donde el header queda vacío
    // y se renderiza el fallback (logo grande) durante unas décimas hasta que el siguiente header se setea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.section, props.title, props.description, props.iconSrc, props.iconAlt, props.actions]);

  return null;
}

