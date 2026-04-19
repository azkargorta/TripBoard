"use client";

export type ReservationTemplateType = "lodging" | "transport" | "activity";

const OPTIONS: Array<{
  value: ReservationTemplateType;
  title: string;
  description: string;
  icon: string;
  activeClasses: string;
  pillClasses: string;
}> = [
  {
    value: "lodging",
    title: "Alojamiento",
    description: "Hotel, apartamento, camping o casa rural.",
    icon: "🏨",
    activeClasses: "border-violet-500 bg-violet-50 text-violet-950",
    pillClasses: "bg-violet-100 text-violet-700",
  },
  {
    value: "transport",
    title: "Transporte",
    description: "Vuelo, tren, coche, ferry o autobús.",
    icon: "✈️",
    activeClasses: "border-sky-500 bg-sky-50 text-sky-950",
    pillClasses: "bg-sky-100 text-sky-700",
  },
  {
    value: "activity",
    title: "Actividad",
    description: "Entradas, excursiones, tours o experiencias.",
    icon: "🎟️",
    activeClasses: "border-emerald-500 bg-emerald-50 text-emerald-950",
    pillClasses: "bg-emerald-100 text-emerald-700",
  },
];

type Props = {
  value: ReservationTemplateType;
  onChange: (value: ReservationTemplateType) => void;
};

export default function ReservationTemplateSelector({ value, onChange }: Props) {
  return (
    <div className="min-w-0 max-w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Tipo de formulario</h3>
        <p className="mt-1 text-sm text-slate-500">
          Elige la plantilla que quieres usar para crear la reserva o documento estructurado.
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-w-0 max-w-full rounded-2xl border px-3 py-3 text-left transition sm:px-4 sm:py-4 ${
                active
                  ? option.activeClasses
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
              }`}
            >
              <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
                <div className="shrink-0 text-2xl">{option.icon}</div>
                <span
                  className={`min-w-0 truncate rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${
                    active ? option.pillClasses : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {option.title}
                </span>
              </div>

              <div className="mt-2 break-words text-sm font-semibold sm:mt-3">{option.title}</div>
              <div className={`mt-1 break-words text-xs ${active ? "text-slate-700" : "text-slate-500"}`}>
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
