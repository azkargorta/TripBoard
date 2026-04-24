"use client";

import { Check, ExternalLink, Star, Ticket } from "lucide-react";
import PlanCardActions from "@/components/trip/plan/PlanCardActions";
import LongTextSheet from "@/components/ui/LongTextSheet";
import { activityLikelyNeedsTicket, buildTicketOfficialSearchUrl } from "@/lib/trip-plan-ticket-hints";

type PlanActivity = {
  trip_id?: string;
  id: string;
  title: string;
  description?: string | null;
  rating?: number | null;
  comment?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_type?: string | null;
  activity_kind?: string | null;
  source?: string | null;
};

type Props = {
  activity: PlanActivity;
  onEdit?: (activity: PlanActivity) => void;
  onDelete?: (activity: PlanActivity) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Premium: aviso de entradas y botón para buscar venta oficial. */
  premiumEnabled?: boolean;
};

function getActivityMeta(kind?: string | null) {
  switch (kind) {
    case "museum":
      return {
        icon: "🏛️",
        label: "Museo",
        badge: "bg-amber-100 text-amber-700",
        card: "border-amber-200/60 bg-gradient-to-br from-amber-50 to-white",
      };
    case "restaurant":
      return {
        icon: "🍽️",
        label: "Restaurante",
        badge: "bg-rose-100 text-rose-700",
        card: "border-rose-200/60 bg-gradient-to-br from-rose-50 to-white",
      };
    case "transport":
      return {
        icon: "🚆",
        label: "Transporte",
        badge: "bg-sky-100 text-sky-700",
        card: "border-sky-200/60 bg-gradient-to-br from-sky-50 to-white",
      };
    case "lodging":
      return {
        icon: "🏨",
        label: "Alojamiento",
        badge: "bg-violet-100 text-violet-700",
        card: "border-violet-200/60 bg-gradient-to-br from-violet-50 to-white",
      };
    case "activity":
      return {
        icon: "🎟️",
        label: "Actividad",
        badge: "bg-emerald-100 text-emerald-700",
        card: "border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white",
      };
    case "visit":
    default:
      return {
        icon: "📍",
        label: "Visita",
        badge: "bg-slate-100 text-slate-700",
        card: "border-slate-200 bg-white",
      };
    }
}

function buildGoogleMapsUrl(activity: PlanActivity) {
  if (typeof activity.latitude === "number" && typeof activity.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }
  const query = activity.address || activity.place_name || activity.title;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function PlanActivityCard({
  activity,
  onEdit,
  onDelete,
  selectable,
  selected,
  onToggleSelect,
  premiumEnabled = false,
}: Props) {
  const meta = getActivityMeta(activity.activity_kind);
  const googleMapsUrl = buildGoogleMapsUrl(activity);
  const rating = typeof activity.rating === "number" ? Math.max(1, Math.min(5, Math.round(activity.rating))) : null;
  const showTicketCta = Boolean(premiumEnabled && activityLikelyNeedsTicket(activity));
  const ticketSearchUrl = showTicketCta ? buildTicketOfficialSearchUrl(activity) : null;

  return (
    <div
      className={`relative rounded-2xl border p-4 shadow-sm ${meta.card} ${selectable ? "cursor-pointer ring-offset-2 transition hover:ring-2 hover:ring-violet-300/80" : ""} ${selected ? "ring-2 ring-violet-500" : ""}`}
      onClick={selectable && onToggleSelect ? () => onToggleSelect() : undefined}
      onKeyDown={
        selectable && onToggleSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleSelect();
              }
            }
          : undefined
      }
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      {selectable ? (
        <button
          type="button"
          className={`absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm ${
            selected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-transparent"
          }`}
          aria-label={selected ? "Quitar selección" : "Seleccionar"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          <Check className="h-4 w-4 stroke-[3]" />
        </button>
      ) : null}
      <PlanCardActions
        placement="topRight"
        googleMapsUrl={googleMapsUrl}
        onEdit={onEdit}
        onDelete={onDelete}
        item={activity}
        accent="emerald"
        stopPropagation={Boolean(selectable)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </div>

          <div className="mt-3 text-base font-semibold text-slate-900" role="heading" aria-level={4}>
            <LongTextSheet
              text={activity.title}
              modalTitle="Actividad"
              minLength={40}
              lineClamp={3}
              className="font-semibold text-slate-900"
            />
          </div>

          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {activity.activity_date || activity.activity_time ? (
              <p>
                {activity.activity_date || "Sin fecha"}
                {activity.activity_time ? ` · ${activity.activity_time}` : ""}
              </p>
            ) : null}
            {activity.place_name ? <p>{activity.place_name}</p> : null}
            {activity.address ? (
              <div className="text-sm text-slate-700">
                <LongTextSheet text={activity.address} modalTitle="Dirección" minLength={48} lineClamp={2} />
              </div>
            ) : null}
            {activity.description ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
                <LongTextSheet text={activity.description} modalTitle="Detalles" minLength={80} lineClamp={3} />
              </div>
            ) : null}
            {rating ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <div className="flex items-center gap-1" aria-label={`${rating} de 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < rating ? "fill-current text-amber-500" : "text-amber-200"}`}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="text-amber-900/70">{rating}/5</span>
              </div>
            ) : null}
            {activity.comment ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <LongTextSheet text={activity.comment} modalTitle="Comentario" minLength={48} lineClamp={2} />
              </div>
            ) : null}
            {showTicketCta && ticketSearchUrl ? (
              <div className="mt-3">
                <a
                  href={ticketSearchUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Abre una búsqueda para localizar la web oficial de entradas; revisa que el dominio sea el del recinto."
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-950 shadow-sm transition hover:bg-amber-100"
                  onClick={selectable ? (e) => e.stopPropagation() : undefined}
                >
                  <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                  Entrada
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                </a>
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Búsqueda orientada a la venta oficial; comprueba siempre la URL antes de pagar.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
