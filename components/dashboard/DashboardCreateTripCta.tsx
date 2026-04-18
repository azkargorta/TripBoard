"use client";

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
      className="animate-dash-primary-once flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-center text-base font-bold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:animate-none md:min-h-[48px] md:text-lg"
    >
      Crear viaje
    </button>
  );
}
