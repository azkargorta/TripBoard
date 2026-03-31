"use client";

import type { TripReservation } from "@/hooks/useTripResources";

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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Reservas</h3>
        <p className="mt-1 text-sm text-slate-500">
          Alojamientos y otras reservas del viaje.
        </p>
      </div>

      {reservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
          No hay reservas registradas todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((reservation) => (
            <div key={reservation.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{reservation.reservation_name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {reservation.provider_name || "Sin proveedor"} · {reservation.check_in_date || "Sin entrada"} → {reservation.check_out_date || "Sin salida"}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Pago:{" "}
                    <span className={reservation.payment_status === "paid" ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                      {reservation.payment_status === "paid" ? "Pagado" : "Pendiente"}
                    </span>
                    {typeof reservation.total_amount === "number" ? ` · ${reservation.total_amount} ${reservation.currency || ""}` : ""}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(reservation)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(reservation.id)}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
