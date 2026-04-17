"use client";

import { useCallback, useEffect, useState } from "react";

export type OnboardingDraft = {
  destination: string;
  startDate: string | null;
  endDate: string | null;
  partySize: number | null;
  tripStyle: string | null;
  /** Texto libre si el usuario no eligió solo chips de fechas */
  dateNotes?: string | null;
};

export function storageOnboardingDoneKey(tripId: string) {
  return `kaviro_ai_onboard_done_v1_${tripId}`;
}

function readDone(tripId: string) {
  try {
    return window.localStorage.getItem(storageOnboardingDoneKey(tripId)) === "1";
  } catch {
    return false;
  }
}

function writeDone(tripId: string) {
  try {
    window.localStorage.setItem(storageOnboardingDoneKey(tripId), "1");
  } catch {
    // ignore
  }
}

function isoAddDays(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useTripAiOnboarding(params: {
  tripId: string;
  tripLoaded: boolean;
  /** Actividades del plan (`trip_activities`), no la tabla legacy `activities`. */
  planActivityCount: number | null;
}) {
  const { tripId, tripLoaded, planActivityCount } = params;

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>({
    destination: "",
    startDate: null,
    endDate: null,
    partySize: null,
    tripStyle: null,
    dateNotes: null,
  });

  useEffect(() => {
    if (!tripLoaded || planActivityCount === null) return;
    if (planActivityCount > 0) {
      setActive(false);
      return;
    }
    if (readDone(tripId)) {
      setActive(false);
      return;
    }
    setActive(true);
    setStep(0);
  }, [tripId, tripLoaded, planActivityCount]);

  const skip = useCallback(() => {
    writeDone(tripId);
    setActive(false);
  }, [tripId]);

  const applyDurationChips = useCallback((nights: number) => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 21);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = isoAddDays(start, Math.max(1, nights) - 1);
    setDraft((d) => ({ ...d, startDate: startIso, endDate: endIso }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft({
      destination: "",
      startDate: null,
      endDate: null,
      partySize: null,
      tripStyle: null,
      dateNotes: null,
    });
  }, []);

  const markComplete = useCallback(() => {
    writeDone(tripId);
    setActive(false);
    resetDraft();
  }, [tripId, resetDraft]);

  return {
    onboardingActive: active,
    onboardingStep: step,
    setOnboardingStep: setStep,
    onboardingDraft: draft,
    setOnboardingDraft: setDraft,
    skipOnboarding: skip,
    markOnboardingComplete: markComplete,
    applyDurationChips,
  };
}
