"use client";

import { useEffect } from "react";
import { useTripBoardHeader, type TripBoardHeaderConfig } from "@/components/layout/TripBoardHeaderContext";

export default function TripBoardPageHeader(props: TripBoardHeaderConfig) {
  const { setHeader, clearHeader } = useTripBoardHeader();

  useEffect(() => {
    setHeader(props);
    return () => clearHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.section, props.title, props.description, props.actions]);

  return null;
}

