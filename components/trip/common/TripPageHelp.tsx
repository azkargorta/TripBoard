"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { HelpIconQuestion } from "@/components/brand/HelpIcon";
import { iconInline16, iconSlotFill40, iconSlotFill44 } from "@/components/ui/iconTokens";

type HelpBlock = { heading: string; bullets: string[] };

type HelpEntry = {
  title: string;
  intro: string;
  blocks: HelpBlock[];
};

function tourStorageKey(tripId: string) {
  return `tripboard_trip_tabs_tour_v1:${tripId}`;
}

/** Primera vez que se muestra la ayuda detallada de esta pantalla (independiente del recorrido por pestañas). */
function pageHelpSeenKey(tripId: string, pageId: string) {
  return `tripboard_trip_page_help_seen_v2:${tripId}:${pageId}`;
}

function readPageHelpSeen(tripId: string, pageId: string) {
  try {
    return window.localStorage.getItem(pageHelpSeenKey(tripId, pageId)) === "1";
  } catch {
    return true;
  }
}

function markPageHelpSeen(tripId: string, pageId: string) {
  try {
    window.localStorage.setItem(pageHelpSeenKey(tripId, pageId), "1");
  } catch {
    /* */
  }
}

function getTripPageHelpId(pathname: string | null): string | null {
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "trip" || parts.length < 2) return null;
  const rest = parts.slice(2);
  if (rest.length === 0 || rest[0] === "overview") return "home";
  const seg = rest[0];
  if (seg === "summary") return "home";
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

/** Marca Kaviro (globo + pin) con fondo sólido en el recurso; misma pieza en todos los pasos del tour/ayuda. */
const HELP_BRAND_MARK_SRC = "/brand/kaviro-globe-pin.png";

const TAB_TOUR: TourStep[] = [
  {
    id: "home",
    title: "Resumen",
    lead: "Paso 1 de 7",
    body: "Resumen del viaje: destino, fechas, accesos rápidos a cada módulo y avisos útiles para el grupo.",
    mobileTip: "Abajo tienes el menú con todas las pestañas; desliza horizontalmente si no caben en pantalla.",
    href: (id) => `/trip/${id}/summary`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Resumen" },
  },
  {
    id: "plan",
    title: "Plan",
    lead: "Paso 2 de 7",
    body: "La agenda por días: actividades, horarios y visitas. Es la referencia compartida de qué hace el grupo y cuándo.",
    mobileTip: "Suele organizarse por día; desplázate dentro de cada día para ver todas las actividades.",
    href: (id) => `/trip/${id}/plan`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Plan" },
  },
  {
    id: "map",
    title: "Rutas",
    lead: "Paso 3 de 7",
    body: "Rutas y trayectos del viaje sobre el mapa: paradas, orden del día y vistas para explorar el entorno o ver el plan georreferenciado.",
    mobileTip: "Gestos de pellizco para zoom; los paneles laterales o inferiores se pueden deslizar o cerrar.",
    href: (id) => `/trip/${id}/map`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Rutas" },
  },
  {
    id: "expenses",
    title: "Gastos",
    lead: "Paso 4 de 7",
    body: "Quién pagó qué, cómo repartirlo y balances para saldar cuentas sin líos al final del viaje.",
    mobileTip: "Mira primero el resumen arriba; el detalle de cada gasto va debajo en lista o tabla.",
    href: (id) => `/trip/${id}/expenses`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Gastos" },
  },
  {
    id: "participants",
    title: "Gente",
    lead: "Paso 5 de 7",
    body: "Participantes, invitaciones y permisos. Cuanto mejor definido esté el grupo, mejor cuadran plan y gastos.",
    mobileTip: "Usa el mismo nombre en gastos que en participantes para que los balances te reconozcan bien.",
    href: (id) => `/trip/${id}/participants`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Participantes" },
  },
  {
    id: "resources",
    title: "Docs",
    lead: "Paso 6 de 7",
    body: "Billetes, reservas, PDFs y enlaces en un solo sitio para que nadie pierda el correo de confirmación.",
    mobileTip: "En móvil, enlaces y archivos se abren con el navegador; guarda lo crítico donde te sea cómodo.",
    href: (id) => `/trip/${id}/resources`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Recursos y listas" },
  },
  {
    id: "ai",
    title: "Asistente personal",
    lead: "Paso 7 de 7",
    body: "Asistente con contexto de este viaje: ideas, organizar un día, dudas y sugerencias según el tipo de chat.",
    mobileTip: "En pantalla pequeña el chat va primero; en el panel lateral tienes conversaciones y «Mostrar tipos».",
    href: (id) => `/trip/${id}/ai-chat`,
    visual: { type: "image", src: HELP_BRAND_MARK_SRC, alt: "Asistente personal" },
  },
];

const TAB_TOUR_PAGE_IDS = new Set(TAB_TOUR.map((s) => s.id));

const HELP: Record<string, HelpEntry> = {
  home: {
    title: "Resumen del viaje",
    intro:
      "Pantalla de resumen del viaje: ves de un vistazo el destino, las fechas, el estado del plan y atajos a cada módulo.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Consultar y, si tienes permiso, editar datos básicos del viaje (nombre, destino, fechas, etc.).",
          "Ir al Plan, Rutas, Gastos, Gente, Docs o asistente personal desde las tarjetas de accesos rápidos o desde el menú inferior.",
          "Leer avisos y recordatorios (clima, datos pendientes, participantes) cuando el viaje aún está incompleto.",
          "Seguir el bloque «Primeros pasos» si el viaje es nuevo: enlaces directos a las tareas más habituales.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Todo el grupo comparte la misma fuente de verdad: menos mensajes sueltos y menos confusiones.",
          "Ahorras tiempo: no hace falta abrir cada módulo para saber si falta algo importante.",
          "Sirve de “tablero” antes y durante el viaje: vuelves aquí para orientarte y repartir tareas.",
        ],
      },
    ],
  },
  plan: {
    title: "Plan del viaje",
    intro:
      "Aquí construyes la agenda: lugares, fechas, horas y coordenadas que luego alimentan el mapa y el resto del viaje.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Añadir, editar y ordenar actividades por día (visitas, comidas, traslados, tiempo libre).",
          "Definir horarios y detalles para que el día sea legible de principio a fin.",
          "Guardar información que después puedes reutilizar al trazar rutas o al consultar con el asistente personal.",
          "Revisar el plan como lista temporal: qué toca antes y qué después, sin depender de chats sueltos.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Un solo plan compartido: todo el mundo ve la misma versión del día.",
          "Menos improvisación last minute: el grupo llega al destino con expectativas alineadas.",
          "Encaja con Rutas y Gastos: lo que planificas aquí da contexto al resto de herramientas.",
        ],
      },
    ],
  },
  map: {
    title: "Rutas",
    intro:
      "Gestiona trayectos y paradas sobre el mapa: crea rutas del día, revisa el orden geográfico y abre vistas como Explorar o el plan georreferenciado.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Ver en el mapa rutas, puntos y tramos ligados a este viaje.",
          "Abrir subpantallas según lo que necesites (por ejemplo explorar el entorno o ver gastos en contexto geográfico).",
          "Comprobar distancias y orden geográfico de las paradas respecto al plan del día.",
          "Volver al resumen del viaje o a otras secciones desde los accesos del header cuando haga falta.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Entiendes de un vistazo si el día es realista (tiempos de desplazamiento, lejanía de puntos).",
          "Evitas discusiones del tipo “¿esto queda lejos?”: la respuesta está en el mapa.",
          "Complementa el Plan: lo que escribiste en agenda cobra sentido sobre el terreno.",
        ],
      },
    ],
  },
  expenses: {
    title: "Gastos",
    intro:
      "Lleva la contabilidad del viaje: quién paga, cómo se reparte y cuánto debe cada uno al resto del grupo.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Registrar gastos con importe, moneda y quién participó en cada pago o consumo.",
          "Ver balances y resúmenes de quién debe a quién para saldar al final del viaje.",
          "Ajustar repartos cuando alguien adelanta dinero o paga por varios.",
          "Consultar el histórico para recordar un gasto concreto o revisar el total por categoría.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Transparencia total: nadie tiene que llevar la cuenta en un Excel aparte.",
          "Menos fricción social: las cifras hablan y el reparto es justo y revisable.",
          "Útil en viajes largos o con mucha gente: el saldo se mantiene claro día a día.",
        ],
      },
    ],
  },
  participants: {
    title: "Gente",
    intro: "Define quién viaja, cómo se llama en la app y qué puede hacer cada persona respecto al viaje.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Añadir o revisar participantes y roles (quién organiza, quién solo consulta, etc., según permisos).",
          "Invitar o gestionar accesos para que el grupo entre al mismo viaje.",
          "Alinear nombres con los que usarás en Gastos para que los balances te reconozcan bien.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Menos errores en repartos y menciones: todos aparecen como en la vida real.",
          "Quien se une tarde entra en un contexto ya definido: no hay “versiones paralelas” del grupo.",
          "Facilita la coordinación: sabes a quién pedir cada cosa.",
        ],
      },
    ],
  },
  resources: {
    title: "Docs y recursos",
    intro: "Centraliza billetes, reservas, PDFs y enlaces para que nadie busque en el buzón a última hora.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Subir archivos o pegar enlaces a reservas, seguros, entradas o guías.",
          "Organizar la documentación del viaje en un solo sitio visible para quien tenga acceso.",
          "Recuperar rápido un PDF o enlace en aeropuerto, hotel o punto de encuentro.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Menos estrés: no dependes de reenviar el mismo correo diez veces.",
          "Historial compartido: si alguien pierde el móvil, el grupo sigue teniendo copia en la nube del viaje.",
          "Complementa el Plan: lo administrativo vive aquí, lo horario en Plan.",
        ],
      },
    ],
  },
  ai: {
    title: "Asistente personal",
    intro:
      "Un chat que conoce el contexto de este viaje: puede proponer ideas, ordenar un día o responder dudas según el modo que elijas.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Escribir preguntas o pedidos en lenguaje natural (itinerarios, alternativas, qué ver en una zona, etc.).",
          "Elegir o cambiar el tipo de conversación para que el asistente personal se enfoque en preguntar, preparar u otras tareas.",
          "Gestionar conversaciones: retomar un hilo o empezar uno nuevo cuando el tema cambie (según tu plan).",
          "Usar sugerencias rápidas como atajos cuando no sepas cómo formular la primera pregunta.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Ahorra tiempo de búsqueda: resume opciones usando los datos que ya tienes en el viaje.",
          "Sirve de “segunda opinión” creativa sin sustituir tu criterio ni las reservas reales.",
          "Encaja con Plan y Rutas: puedes pasar de la idea al calendario o al mapa con menos saltos mentales.",
        ],
      },
    ],
  },
  settings: {
    title: "Ajustes del viaje",
    intro: "Configura opciones que afectan a todo el viaje: nombre visible, permisos y otros ajustes según lo que permita la app.",
    blocks: [
      {
        heading: "Qué puedes hacer en esta página",
        bullets: [
          "Revisar y cambiar ajustes del viaje que aplican a todo el grupo (según tu rol).",
          "Comprobar preferencias antes de compartir el viaje o invitar a más gente.",
        ],
      },
      {
        heading: "Ventajas",
        bullets: [
          "Control centralizado: evitas cambiar el mismo dato en varios sitios.",
          "Quien administra el viaje puede dejarlo fino sin tocar el plan día a día.",
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

function HelpVisualBadge({
  visual,
  size = "md",
}: {
  visual: TourStep["visual"];
  size?: "md" | "lg";
}) {
  /** Mismo tamaño en tour y en ayuda por pantalla; sin padding externo para que el pictograma llene el marco. */
  const frameClass =
    size === "lg"
      ? "h-[5.5rem] w-[5.5rem] rounded-[1.75rem]"
      : "h-20 w-20 rounded-3xl";
  const innerRound = size === "lg" ? "rounded-[1.35rem]" : "rounded-2xl";
  const fillSizes = size === "lg" ? "88px" : "80px";
  const emojiClass = size === "lg" ? "text-[3.35rem]" : "text-[2.95rem]";

  return (
    <div
      className={`relative flex shrink-0 ${frameClass} items-center justify-center overflow-hidden border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/90`}
    >
      {visual.type === "emoji" ? (
        <div
          className={`flex h-full w-full items-center justify-center ${innerRound} bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-slate-200/70`}
        >
          <span className={`${emojiClass} leading-none`} aria-hidden>
            {visual.value}
          </span>
        </div>
      ) : (
        <div className={`relative h-full w-full ${innerRound} bg-white`}>
          <Image
            src={visual.src}
            alt={visual.alt}
            fill
            sizes={fillSizes}
            className="object-contain object-center"
            priority={false}
          />
        </div>
      )}
    </div>
  );
}

function PageHelpVisualHeader({ pageId }: { pageId: string }) {
  if (pageId === "settings") {
    return (
      <div className="mb-5 flex flex-col items-center text-center">
        <HelpVisualBadge visual={{ type: "emoji", value: "⚙️" }} />
        <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-violet-800/90">Estás en</p>
        <p className="text-lg font-bold text-slate-950">Ajustes</p>
      </div>
    );
  }

  const step = TAB_TOUR.find((s) => s.id === pageId);
  if (!step) return null;
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <HelpVisualBadge visual={step.visual} />
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-violet-800/90">Estás en</p>
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
  const [mounted, setMounted] = useState(false);
  /** Se incrementa al terminar el recorrido por pestañas para disparar la ayuda detallada de la pantalla actual. */
  const [tourPulse, setTourPulse] = useState(0);

  const finishTour = useCallback(() => {
    if (tripId) markTourSeen(tripId);
    setTourOpen(false);
    setTourStep(0);
    setTourPulse((p) => p + 1);
  }, [tripId]);

  const closePageHelp = useCallback(() => {
    if (tripId && pageId) markPageHelpSeen(tripId, pageId);
    setPageHelpOpen(false);
  }, [tripId, pageId]);

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

  /** Primera vez en cada pantalla: ayuda detallada (tras el recorrido global, si aplica). */
  useEffect(() => {
    if (!tripId || !pageId || !entry) return;
    if (readPageHelpSeen(tripId, pageId)) return;
    if (tourOpen) return;
    const tourBlocksFirst = TAB_TOUR_PAGE_IDS.has(pageId) && !readTourSeen(tripId);
    if (tourBlocksFirst) return;

    const t = window.setTimeout(() => {
      if (readPageHelpSeen(tripId, pageId)) return;
      setPageHelpOpen(true);
    }, 400);
    return () => window.clearTimeout(t);
  }, [tripId, pageId, entry, tourOpen, tourPulse, pathname]);

  useEffect(() => {
    if (!tourOpen && !pageHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pageHelpOpen) {
        closePageHelp();
        return;
      }
      if (tourOpen) finishTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen, pageHelpOpen, finishTour, closePageHelp]);

  const openManual = useCallback(() => {
    setPageHelpOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const tourStepData = TAB_TOUR[tourStep];
  const isLastTourStep = tourStep >= TAB_TOUR.length - 1;

  if (!tripId || !pageId || !entry) return null;

  return (
    <>
      <button
        type="button"
        onClick={openManual}
        disabled={tourOpen}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:pointer-events-none disabled:opacity-40"
        aria-label={`Ayuda: ${entry.title}`}
        title={tourOpen ? "Cierra el recorrido para usar la ayuda" : "Ayuda de esta página"}
      >
        <HelpIconQuestion className="h-6 w-6" />
      </button>

      {mounted
        ? createPortal(
            <>
              {tourOpen && tourStepData ? (
                <div
                  className="fixed inset-0 z-[1180] flex items-center justify-center overflow-y-auto overscroll-contain px-3 py-[max(10px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4"
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
                  <div className="pointer-events-auto relative my-auto flex min-h-0 w-full max-w-md max-h-[min(92dvh,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90dvh,calc(100svh-2rem))]">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-violet-900 px-5 pb-4 pt-4 text-white sm:pt-5">
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
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 ${iconSlotFill40}`}
                          aria-label="Cerrar"
                        >
                          <X aria-hidden />
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
                              i === tourStep ? "w-6 bg-violet-300" : i < tourStep ? "w-1.5 bg-white/50" : "w-1.5 bg-white/25"
                            }`}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
                      <div className="flex flex-col items-center text-center">
                        <HelpVisualBadge visual={tourStepData.visual} size="lg" />
                        <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-violet-800">{tourStepData.lead}</p>
                        <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{tourStepData.title}</h3>
                        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{tourStepData.body}</p>
                        <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">{tourStepData.mobileTip}</p>
                        <Link
                          href={tourStepData.href(tripId)}
                          onClick={finishTour}
                          className="mt-5 text-sm font-semibold text-violet-700 underline-offset-2 hover:text-violet-900 hover:underline"
                        >
                          Ir a {tourStepData.title} ahora →
                        </Link>
                      </div>
                    </div>

                    <div className="shrink-0 border-t border-slate-100 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
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
                            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-35 ${iconSlotFill44}`}
                            aria-label="Paso anterior"
                          >
                            <ChevronLeft aria-hidden />
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
                              <ChevronRight className={iconInline16} aria-hidden />
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
                  className="fixed inset-0 z-[1180] flex items-center justify-center overflow-y-auto overscroll-contain px-3 py-[max(10px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="trip-page-help-title"
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
                    aria-label="Cerrar ayuda"
                    onClick={closePageHelp}
                  />
                  <div className="pointer-events-auto relative my-auto flex min-h-0 w-full max-w-lg max-h-[min(92dvh,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90dvh,calc(100svh-2rem))]">
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-4 sm:pt-5">
                      <div className="min-w-0 pr-2">
                        <h2 id="trip-page-help-title" className="text-lg font-bold leading-snug text-slate-950">
                          {entry.title}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={closePageHelp}
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 ${iconSlotFill40}`}
                        aria-label="Cerrar"
                      >
                        <X aria-hidden />
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
                    <div className="shrink-0 border-t border-slate-100 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
                      <button
                        type="button"
                        onClick={closePageHelp}
                        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Entendido
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </>
  );
}
