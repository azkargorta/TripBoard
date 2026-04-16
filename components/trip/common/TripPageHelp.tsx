"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";

type HelpBlock = { heading: string; bullets: string[] };

type HelpEntry = {
  title: string;
  intro: string;
  blocks: HelpBlock[];
};

function helpStorageKey(tripId: string, pageId: string) {
  return `tripboard_trip_page_help_v1:${tripId}:${pageId}`;
}

/** Identificador estable por “pestaña” del viaje (incluye subrutas de mapa como una sola ayuda). */
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
          "El botón «?» arriba a la derecha vuelve a mostrar esta ayuda cuando la necesites.",
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
        bullets: [
          "Las fichas de persona pueden estar en lista: toca para expandir si hay más datos.",
        ],
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

export default function TripPageHelp() {
  const pathname = usePathname();
  const params = useParams();
  const tripId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const pageId = useMemo(() => {
    if (!tripId) return null;
    return getTripPageHelpId(pathname);
  }, [pathname, tripId]);

  const entry = pageId ? HELP[pageId] : null;
  const [open, setOpen] = useState(false);

  const readSeen = useCallback(() => {
    if (!tripId || !pageId) return true;
    try {
      return window.localStorage.getItem(helpStorageKey(tripId, pageId)) === "1";
    } catch {
      return true;
    }
  }, [tripId, pageId]);

  const markSeen = useCallback(() => {
    if (!tripId || !pageId) return;
    try {
      window.localStorage.setItem(helpStorageKey(tripId, pageId), "1");
    } catch {
      /* */
    }
  }, [tripId, pageId]);

  useEffect(() => {
    setOpen(false);
    if (!pageId || !tripId || !entry) return;
    if (!readSeen()) setOpen(true);
  }, [pageId, tripId, pathname, entry, readSeen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markSeen();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, markSeen]);

  const openManual = useCallback(() => setOpen(true), []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

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

      {open ? (
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
            onClick={close}
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
                onClick={close}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                onClick={close}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
