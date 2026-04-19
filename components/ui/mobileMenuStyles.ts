/** Estilos compartidos: menú hamburguesa del viaje y drawer «Tus viajes» (dashboard). */

import { iconSlotFill40 } from "@/components/ui/iconTokens";

export const mobileMenuSectionTitle =
  "text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500";

/** Fila tipo tarjeta (enlaces / botones de acción) */
export const mobileMenuRowBase =
  "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/80 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:border-cyan-300/60 hover:shadow-md hover:shadow-cyan-900/[0.06] active:scale-[0.99]";

export const mobileMenuRowIconWrap =
  `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-700 ring-1 ring-slate-200/80 ${iconSlotFill40}`;

/** Cuenta / ajustes */
export const mobileMenuRowViolet =
  "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white px-4 py-3 text-left text-sm font-semibold text-violet-950 shadow-sm ring-1 ring-violet-900/[0.06] transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-900/10 active:scale-[0.99]";

export const mobileMenuRowVioletIcon =
  `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-inner ${iconSlotFill40}`;

/** Precios (ámbar / valor) */
export const mobileMenuRowPricing =
  "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 px-4 py-3 text-left text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-900/[0.05] transition hover:border-amber-300 hover:shadow-md active:scale-[0.99]";

export const mobileMenuRowPricingIcon =
  `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-inner ${iconSlotFill40}`;

/** Cerrar sesión */
export const mobileMenuRowSignOut =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-300/90 bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-md ring-1 ring-black/10 transition hover:from-slate-700 hover:to-slate-800 active:scale-[0.99]";

/** Admin (dashboard) */
export const mobileMenuRowAdmin =
  "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-100 to-amber-50 px-4 py-3 text-left text-sm font-extrabold text-amber-950 shadow-sm transition hover:border-amber-400 hover:shadow-md active:scale-[0.99]";

export const mobileMenuRowAdminIcon =
  `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-800 text-white shadow-inner ${iconSlotFill40}`;
