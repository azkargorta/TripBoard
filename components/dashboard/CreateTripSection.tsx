"use client";

import { useState } from "react";
import CreateTripForm from "./CreateTripForm";

export default function CreateTripSection() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          + Crear nuevo viaje
        </button>
      ) : (
        <div className="space-y-4">
          <CreateTripForm />
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
