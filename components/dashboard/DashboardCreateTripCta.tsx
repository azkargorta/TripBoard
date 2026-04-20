"use client";

import { btnPrimary } from "@/components/ui/brandStyles";

type Props = {
  disabled?: boolean;
};

export default function DashboardCreateTripCta({ disabled }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        window.dispatchEvent(new CustomEvent("kaviro:open-create-trip"));
        if (window.location.hash !== "#create-trip") {
          window.location.hash = "create-trip";
        }
        window.requestAnimationFrame(() => {
          document.getElementById("create-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }}
      className={`animate-dash-primary-once w-full motion-reduce:animate-none ${btnPrimary}`}
    >
      Crear viaje
    </button>
  );
}
