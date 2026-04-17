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

export function useTripAiOnboarding(params: {
  tripId: string;
  tripLoaded: boolean;
  /** Actividades del plan (`trip_activities`), no la tabla legacy `activities`. */
  planActivityCount: number | null;
}) {
  const { tripId, tripLoaded, planActivityCount } = params;

  const [active, setActive] = useState(false);
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
  }, [tripId, tripLoaded, planActivityCount]);

  const skip = useCallback(() => {
    writeDone(tripId);
    setActive(false);
  }, [tripId]);

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
    onboardingDraft: draft,
    setOnboardingDraft: setDraft,
    skipOnboarding: skip,
    markOnboardingComplete: markComplete,
  };
}
