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
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
          No hay reservas registradas todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((reservation) => (
            <div key={reservation.id} className="min-w-0 rounded-2xl border border-slate-200 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 max-w-full flex-1 break-words">
                  <LongTextSheet
                    text={reservation.reservation_name}
                    modalTitle="Reserva"
                    minLength={40}
                    lineClamp={4}
                    className="font-semibold leading-snug text-slate-900"
                  />
                  <div className="mt-1 break-words text-sm text-slate-500">
                    {reservation.provider_name || "Sin proveedor"} · {reservation.check_in_date || "Sin entrada"} →{" "}
                    {reservation.check_out_date || "Sin salida"}
                  </div>
                  <div className="mt-1 break-words text-sm text-slate-500">
                    Pago:{" "}
                    <span className={reservation.payment_status === "paid" ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                      {reservation.payment_status === "paid" ? "Pagado" : "Pendiente"}
                    </span>
                    {typeof reservation.total_amount === "number" ? ` · ${reservation.total_amount} ${reservation.currency || ""}` : ""}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
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
