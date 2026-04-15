"use client";

import { useEffect } from "react";

export default function PrintOnLoad() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

