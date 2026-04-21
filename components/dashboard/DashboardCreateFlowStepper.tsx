import { FREE_PLAN_CREATION_STEPS } from "@/lib/dashboard-creation-flow";

const PREMIUM_STEPS = ["Crear viaje", "Asistente Privado", "Editar a tu gusto"] as const;

function StepCircle({ active, n }: { active: boolean; n: number }) {
  return (
    <span
      className={
        active
          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow-sm sm:h-7 sm:w-7 sm:text-[11px] dark:bg-violet-500"
          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-600 sm:h-7 sm:w-7 sm:text-[11px] dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200"
      }
    >
      {n}
    </span>
  );
}

function StepCircleSm({ active, n }: { active: boolean; n: number }) {
  return (
    <span
      className={
        active
          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow-sm sm:h-7 sm:w-7 sm:text-[11px] dark:bg-violet-500"
          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-600 sm:h-7 sm:w-7 sm:text-[11px] dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200"
      }
    >
      {n}
    </span>
  );
}

export default function DashboardCreateFlowStepper({ isPremium }: { isPremium: boolean }) {
  if (isPremium) {
    return (
      <ol className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-500 sm:text-xs md:gap-x-4 dark:text-slate-300">
        {PREMIUM_STEPS.map((label, i) => (
          <li key={label} className="flex min-w-0 max-w-full items-center gap-1.5">
            <StepCircle active={i === 0} n={i + 1} />
            <span className={i === 0 ? "font-medium text-slate-800 dark:text-slate-100" : ""}>{label}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="mb-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-slate-500 sm:grid-cols-3 md:flex md:flex-wrap md:gap-x-3 md:gap-y-1.5 md:text-xs dark:text-slate-300">
      {FREE_PLAN_CREATION_STEPS.map((step, i) => (
        <li key={step.label} className="flex min-w-0 items-center gap-1 sm:gap-1.5">
          <StepCircleSm active={i === 0} n={i + 1} />
          <span className={i === 0 ? "font-medium text-slate-800 dark:text-slate-100" : "min-w-0 leading-tight"}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
