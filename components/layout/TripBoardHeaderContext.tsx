"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type TripBoardHeaderConfig = {
  /** Sección (eyebrow) junto al nombre del viaje */
  section?: string;
  title?: string;
  description?: string;
  /** Icono del módulo/página (reemplaza el logo general en el header). */
  iconSrc?: string;
  iconAlt?: string;
  actions?: ReactNode;
};

type Ctx = {
  header: TripBoardHeaderConfig;
  setHeader: (next: TripBoardHeaderConfig) => void;
  clearHeader: () => void;
};

const TripBoardHeaderContext = createContext<Ctx | null>(null);

export function TripBoardHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<TripBoardHeaderConfig>({});

  const setHeader = useCallback((next: TripBoardHeaderConfig) => {
    setHeaderState(next);
  }, []);

  const clearHeader = useCallback(() => {
    setHeaderState({});
  }, []);

  const value = useMemo<Ctx>(() => ({ header, setHeader, clearHeader }), [header, setHeader, clearHeader]);

  return <TripBoardHeaderContext.Provider value={value}>{children}</TripBoardHeaderContext.Provider>;
}

export function useTripBoardHeader() {
  const ctx = useContext(TripBoardHeaderContext);
  if (!ctx) {
    throw new Error("useTripBoardHeader debe usarse dentro de TripBoardHeaderProvider.");
  }
  return ctx;
}

