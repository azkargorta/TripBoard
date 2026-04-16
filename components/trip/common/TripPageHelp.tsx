"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";

type HelpBlock = { heading: string; bullets: string[] };

type HelpEntry = {
  title: string;
  intro: string;
  blocks: HelpBlock[];
};

function tourStorageKey(tripId: string) {
  return `tripboard_trip_tabs_tour_v1:${tripId}`;
}

function getTripPageHelpId(pathname: string | null): string | null {
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "trip" || parts.length < 2) return null;
  const rest = parts.slice(2);
  if (rest.length === 0 || rest[0] === "overview") return "home";
  const seg = rest[0];
  if (seg === "plan") return "plan";
  if (seg === "map") return "map";
  if (seg === "expenses") return "expenses";
  if (seg === "participants") return "participants";
  if (seg === "resources") return "resources";
  if (seg === "ai-chat" || seg === "ai") return "ai";
  if (seg === "settings") return "settings";
  return null;
}

type TourStep = {
  id: string;
  title: string;
  lead: string;
  body: string;
  mobileTip: string;
  href: (tripId: string) => string;
  visual: { type: "emoji"; value: string } | { type: "image"; src: string; alt: string };
};

const TAB_TOUR: TourStep[] = [
  {
    id: "home",
    title: "Inicio",
    lead: "Paso 1 de 7",
    body: "Resumen del viaje: destino, fechas, accesos rápidos a cada módulo y avisos útiles para el grupo.",
    mobileTip: "Abajo tienes el menú con todas las pestañas; desliza horizontalmente si no caben en pantalla.",
    href: (id) => `/trip/${id}`,
    visual: { type: "emoji", value: "🏠" },
  },
  {
    id: "plan",
    title: "Plan",
    lead: "Paso 2 de 7",
    body: "La agenda por días: actividades, horarios y visitas. Es la referencia compartida de qué hace el grupo y cuándo.",
    mobileTip: "Suele organizarse por día; desplázate dentro de cada día para ver todas las actividades.",
    href: (id) => `/trip/${id}/plan`,
    visual: { type: "image", src: "/brand/tabs/plan.png", alt: "" },
  },
  {
    id: "map",
    title: "Mapa",
    lead: "Paso 3 de 7",
    body: "Geografía del viaje: rutas, paradas y vistas como explorar el entorno o ver el plan sobre el mapa.",
    mobileTip: "Gestos de pellizco para zoom; los paneles laterales o inferiores se pueden deslizar o cerrar.",
    href: (id) => `/trip/${id}/map`,
    visual: { type: "image", src: "/brand/tabs/map.png", alt: "" },
  },
  {
    id: "expenses",
    title: "Gastos",
    lead: "Paso 4 de 7",
    body: "Quién pagó qué, cómo repartirlo y balances para saldar cuentas sin líos al final del viaje.",
    mobileTip: "Mira primero el resumen arriba; el detalle de cada gasto va debajo en lista o tabla.",
    href: (id) => `/trip/${id}/expenses`,
    visual: { type: "image", src: "/brand/tabs/expenses.png", alt: "" },
  },
  {
    id: "participants",
    title: "Gente",
    lead: "Paso 5 de 7",
    body: "Participantes, invitaciones y permisos. Cuanto mejor definido esté el grupo, mejor cuadran plan y gastos.",
    mobileTip: "Usa el mismo nombre en gastos que en participantes para que los balances te reconozcan bien.",
    href: (id) => `/trip/${id}/participants`,
    visual: { type: "image", src: "/brand/tabs/participants.png", alt: "" },
  },
  {
    id: "resources",
    title: "Docs",
    lead: "Paso 6 de 7",
    body: "Billetes, reservas, PDFs y enlaces en un solo sitio para que nadie pierda el correo de confirmación.",
    mobileTip: "En móvil, enlaces y archivos se abren con el navegador; guarda lo crítico donde te sea cómodo.",
    href: (id) => `/trip/${id}/resources`,
    visual: { type: "image", src: "/brand/tabs/documents.png", alt: "" },
  },
  {
    id: "ai",
    title: "IA",
    lead: "Paso 7 de 7",
    body: "Asistente con contexto de este viaje: ideas, organizar un día, dudas y sugerencias según el tipo de chat.",
    mobileTip: "En pantalla pequeña el chat va primero; en el panel lateral tienes conversaciones y «Mostrar tipos».",
    href: (id) => `/trip/${id}/ai-chat`,
    visual: { type: "image", src: "/brand/tabs/ai.png", alt: "" },
  },
];

const TAB_TOUR_PAGE_IDS = new Set(TAB_TOUR.map((s) => s.id));

const HELP: Record<string, HelpEntry> = {
  home: {
    title: "Inicio del viaje",
    intro:
      "Aquí ves el resumen del viaje: fechas, destino, accesos rápidos a cada módulo y el estado general del grupo.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Revisar y editar datos básicos del viaje (si tienes permiso).",
          "Saltar a Plan, Mapa, Gastos, Gente, Docs o IA desde las tarjetas o el menú inferior.",
          "Ver avisos y primeros pasos sugeridos cuando el viaje está vacío.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "El menú inferior reúne las mismas secciones: desliza si no ves todas las pestañas.",
          "Parte del detalle puede estar colapsado; ábrelo para ver fechas, notas o enlaces.",
          "El botón «?» vuelve a mostrar esta ayuda cuando la necesites.",
        ],
      },
    ],
  },
  plan: {
    title: "Plan del viaje",
    intro: "Organiza días, actividades y horarios. Es la agenda compartida del grupo.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Añadir o editar actividades por día.",
          "Ordenar el día y ver qué toca en cada momento.",
          "Preparar el viaje antes de pasar al mapa o a los gastos.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "Suele mostrarse un día a la vez: desplázate verticalmente dentro del día.",
          "Si añades muchas visitas, usa el resumen del día para no perderte.",
        ],
      },
    ],
  },
  map: {
    title: "Mapa",
    intro: "Visualiza el destino, rutas, paradas y vistas como Explorar o Plan en mapa.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Ver rutas y puntos relacionados con el viaje.",
          "Abrir subpantallas (explorar, gastos en mapa, etc.) según lo que necesites.",
          "Volver al resumen del viaje desde los accesos del header cuando haga falta.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "El mapa ocupa mucho: zoom con gestos; los paneles suelen ser deslizables.",
          "Si el teclado o la barra inferior tapa contenido, cierra paneles o desplázate.",
        ],
      },
    ],
  },
  expenses: {
    title: "Gastos",
    intro: "Registra gastos compartidos, quién pagó y cómo saldar cuentas entre el grupo.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Añadir gastos con importe, moneda y participantes implicados.",
          "Ver balances y quién debe a quién.",
          "Mantener el split al día para evitar discusiones al final del viaje.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "Las tablas y listas largas se leen mejor en vertical; desplázate por secciones.",
          "Revisa el resumen arriba antes de bajar al detalle de cada gasto.",
        ],
      },
    ],
  },
  participants: {
    title: "Gente",
    intro: "Participantes del viaje, permisos y cómo encaja cada persona en gastos y plan.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Invitar o gestionar quién forma parte del viaje.",
          "Alinear nombres con los que usas en gastos para que los balances cuadren.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: ["Las fichas de persona pueden estar en lista: toca para expandir si hay más datos."],
      },
    ],
  },
  resources: {
    title: "Docs y recursos",
    intro: "Reservas, billetes, PDFs y enlaces útiles centralizados para todo el grupo.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Subir o enlazar documentos importantes.",
          "Encontrar rápido lo que hace falta en aeropuerto o alojamiento.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "Las descargas o vistas previas dependen del navegador; guarda enlaces críticos en favoritos si quieres.",
        ],
      },
    ],
  },
  ai: {
    title: "Asistente IA",
    intro: "Chatea con contexto del viaje: ideas, planificación y respuestas según el modo de chat.",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Elegir conversación o empezar una nueva (según tu plan).",
          "Cambiar el tipo de chat para orientar mejor a la IA antes de escribir.",
          "Usar sugerencias rápidas cuando no sepas por dónde empezar.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "El historial y los ajustes suelen estar en columnas: en pantalla pequeña, primero el chat y luego el panel lateral.",
          "Abre «Mostrar tipos» en el panel si necesitas cambiar de modo sin perder el hilo.",
        ],
      },
    ],
  },
  settings: {
    title: "Ajustes del viaje",
    intro: "Opciones específicas de este viaje (nombre, permisos avanzados, etc., según lo que tenga la app).",
    blocks: [
      {
        heading: "Qué puedes hacer",
        bullets: [
          "Revisar configuración que afecta a todo el grupo.",
          "Volver al inicio del viaje si solo querías consultar datos generales.",
        ],
      },
      {
        heading: "En el móvil",
        bullets: [
          "Los formularios largos siguen el scroll vertical; guarda antes de salir si hay botón de guardar.",
        ],
      },
    ],
  },
};

function readTourSeen(tripId: string) {
  try {
    return window.localStorage.getItem(tourStorageKey(tripId)) === "1";
  } catch {
    return true;
  }
}

function markTourSeen(tripId: string) {
  try {
    window.localStorage.setItem(tourStorageKey(tripId), "1");
  } catch {
    /* */
  }
}

function PageHelpVisualHeader({ pageId }: { pageId: string }) {
  const step = TAB_TOUR.find((s) => s.id === pageId);
  if (!step) return null;
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-cyan-50/80 shadow-inner">
        {step.visual.type === "emoji" ? (
          <span className="text-[2.75rem] leading-none" aria-hidden>
            {step.visual.value}
          </span>
        ) : (
          <Image src={step.visual.src} alt={step.visual.alt} width={56} height={56} className="object-contain" />
        )}
      </div>
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-cyan-800/90">Estás en</p>
      <p className="text-lg font-bold text-slate-950">{step.title}</p>
    </div>
  );
}

export default function TripPageHelp() {
  const pathname = usePathname();
  const params = useParams();
  const tripId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const pageId = useMemo(() => {
    if (!tripId) return null;
    return getTripPageHelpId(pathname);
  }, [pathname, tripId]);

  /** Evita reiniciar el recorrido al cambiar de ruta mientras el usuario sigue en el tour. */
  const tourOfferedRef = useRef(false);

  useEffect(() => {
    tourOfferedRef.current = false;
  }, [tripId]);

  const entry = pageId ? HELP[pageId] : null;

  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [pageHelpOpen, setPageHelpOpen] = useState(false);

  const finishTour = useCallback(() => {
    if (tripId) markTourSeen(tripId);
    setTourOpen(false);
    setTourStep(0);
  }, [tripId]);

  /** Primera vez en el viaje: recorrido visual por las 7 pestañas principales. */
  useEffect(() => {
    if (!tripId || !pageId) return;
    if (!TAB_TOUR_PAGE_IDS.has(pageId)) return;
    if (readTourSeen(tripId)) return;
    if (tourOfferedRef.current) return;

    const openTour = () => {
      if (readTourSeen(tripId) || tourOfferedRef.current) return;
      tourOfferedRef.current = true;
      setTourStep(0);
      setTourOpen(true);
    };

    if (pageId !== "home") {
      openTour();
      return;
    }

    const fallback = window.setTimeout(() => {
      openTour();
    }, 3200);

    const onFirstRunDismiss = (e: Event) => {
      const ce = e as CustomEvent<{ tripId?: string }>;
      if (ce.detail?.tripId !== tripId) return;
      window.clearTimeout(fallback);
      openTour();
    };

    window.addEventListener("tripboard:first-run-dismissed", onFirstRunDismiss as EventListener);
    return () => {
      window.removeEventListener("tripboard:first-run-dismissed", onFirstRunDismiss as EventListener);
      window.clearTimeout(fallback);
    };
  }, [tripId, pageId, pathname]);

  useEffect(() => {
    if (!tourOpen && !pageHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pageHelpOpen) {
        setPageHelpOpen(false);
        return;
      }
      if (tourOpen) finishTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen, pageHelpOpen, finishTour]);

  const openManual = useCallback(() => {
    setPageHelpOpen(true);
  }, []);

  const tourStepData = TAB_TOUR[tourStep];
  const isLastTourStep = tourStep >= TAB_TOUR.length - 1;

  if (!tripId || !pageId || !entry) return null;

  return (
    <>
      <button
        type="button"
        onClick={openManual}
        className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 md:min-h-0 md:min-w-0 md:h-9 md:w-9"
        aria-label={`Ayuda: ${entry.title}`}
        title="Ayuda de esta página"
      >
        <HelpCircle className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} aria-hidden />
      </button>

      {tourOpen && tourStepData ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trip-tab-tour-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Cerrar recorrido"
            onClick={finishTour}
          />
          <div
            className="relative flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-[0_-16px_48px_rgba(15,23,42,0.15)] sm:max-h-[88vh] sm:rounded-[28px] sm:shadow-2xl"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-5 pb-4 pt-4 text-white sm:pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Recorrido del viaje</p>
                  <h2 id="trip-tab-tour-title" className="mt-1 text-lg font-extrabold leading-tight">
                    Qué hay en cada pestaña
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={finishTour}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/80">
                Siete pasos, uno por cada sección. Puedes saltar cuando quieras; luego podrás repetir ayuda con «?» en
                cualquier pantalla.
              </p>
              <div className="mt-4 flex justify-center gap-1.5">
                {TAB_TOUR.map((s, i) => (
                  <span
                    key={s.id}
                    className={`h-1.5 rounded-full transition-all ${
                      i === tourStep ? "w-6 bg-cyan-300" : i < tourStep ? "w-1.5 bg-white/50" : "w-1.5 bg-white/25"
                    }`}
                    aria-hidden
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white to-cyan-50 shadow-sm">
                  {tourStepData.visual.type === "emoji" ? (
                    <span className="text-[3.25rem] leading-none" aria-hidden>
                      {tourStepData.visual.value}
                    </span>
                  ) : (
                    <Image
                      src={tourStepData.visual.src}
                      alt={tourStepData.visual.alt}
                      width={72}
                      height={72}
                      className="object-contain"
                    />
                  )}
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-cyan-800">{tourStepData.lead}</p>
                <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{tourStepData.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{tourStepData.body}</p>
                <div className="mt-5 w-full max-w-sm rounded-2xl border border-cyan-200/80 bg-cyan-50/90 px-4 py-3 text-left">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-cyan-900/80">En el móvil</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-cyan-950/90">{tourStepData.mobileTip}</p>
                </div>
                <Link
                  href={tourStepData.href(tripId)}
                  onClick={finishTour}
                  className="mt-5 text-sm font-semibold text-cyan-700 underline-offset-2 hover:text-cyan-900 hover:underline"
                >
                  Ir a {tourStepData.title} ahora →
                </Link>
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={finishTour}
                  className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                >
                  Saltar recorrido
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={tourStep <= 0}
                    onClick={() => setTourStep((s) => Math.max(0, s - 1))}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Paso anterior"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  {isLastTourStep ? (
                    <button
                      type="button"
                      onClick={finishTour}
                      className="inline-flex min-h-[48px] min-w-[min(100%,12rem)] items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Entendido
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTourStep((s) => Math.min(TAB_TOUR.length - 1, s + 1))}
                      className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pageHelpOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trip-page-help-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Cerrar ayuda"
            onClick={() => setPageHelpOpen(false)}
          />
          <div
            className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-t-[28px] border border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.12)] sm:max-h-[85vh] sm:rounded-[24px] sm:shadow-xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-4 sm:pt-5">
              <h2 id="trip-page-help-title" className="pr-2 text-lg font-bold leading-snug text-slate-950">
                {entry.title}
              </h2>
              <button
                type="button"
                onClick={() => setPageHelpOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <PageHelpVisualHeader pageId={pageId} />
              <p className="text-sm leading-relaxed text-slate-600">{entry.intro}</p>
              <div className="mt-5 space-y-5">
                {entry.blocks.map((block) => (
                  <div key={block.heading}>
                    <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{block.heading}</h3>
                    <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-relaxed text-slate-700">
                      {block.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
              <button
                type="button"
                onClick={() => setPageHelpOpen(false)}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
