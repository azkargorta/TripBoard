"use client";

import type { TripReservation } from "@/hooks/useTripResources";
import LongTextSheet from "@/components/ui/LongTextSheet";

export default function ReservationList({
  reservations,
  onEdit,
  onDelete,
}: {
  reservations: TripReservation[];
  onEdit: (reservation: TripReservation) => void;
  onDelete: (reservationId: string) => void;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Reservas</h3>
        <p className="mt-1 text-sm text-slate-500">
          Alojamientos y otras reservas del viaje.
        </p>
      </div>

      {reservations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">🎫</div>
          <p className="text-sm font-semibold text-slate-700">Sin reservas todavía</p>
          <p className="mt-1 text-xs text-slate-400">Añade vuelos, hoteles y traslados para tenerlos a mano durante el viaje.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((reservation) => (
            {/* D2 — Boarding pass style card */}
            {(() => {
              const type = (reservation.reservation_type || "").toLowerCase();
              const isHotel = type.includes("hotel") || type.includes("lodging") || type.includes("alojamiento");
              const isFlight = type.includes("flight") || type.includes("vuelo") || type.includes("avion");
              const isTrain = type.includes("train") || type.includes("tren") || type.includes("bus");
              const stripe = isFlight ? "bg-blue-500" : isHotel ? "bg-violet-500" : isTrain ? "bg-emerald-500" : "bg-slate-400";
              const icon = isFlight ? "✈️" : isHotel ? "🏨" : isTrain ? "🚂" : "📋";
              return (
                <div key={reservation.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                  {/* Color stripe left */}
                  <div className={`h-1.5 w-full ${stripe}`} />
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg mt-0.5">{icon}</div>
                    <div className="min-w-0 flex-1">
                      <LongTextSheet text={reservation.reservation_name} modalTitle="Reserva" minLength={40} lineClamp={2} className="font-extrabold text-sm leading-snug text-slate-900" />
                      <p className="mt-1 text-xs text-slate-500">{reservation.provider_name || "Sin proveedor"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reservation.check_in_date && (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            📅 {reservation.check_in_date}
                            {reservation.check_out_date ? ` → ${reservation.check_out_date}` : ""}
                          </span>
                        )}
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${reservation.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {reservation.payment_status === "paid" ? "✓ Pagado" : "⏳ Pendiente"}
                        </span>
                        {typeof reservation.total_amount === "number" && (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">
                            {reservation.total_amount} {reservation.currency || ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button type="button" onClick={() => onEdit(reservation)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Editar</button>
                      <button type="button" onClick={() => onDelete(reservation.id)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Eliminar</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          ))}
        </div>
      )}
    </div>
  );
}
