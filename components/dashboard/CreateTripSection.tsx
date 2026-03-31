"use client";

import { useState } from "react";
import CreateTripForm from "./CreateTripForm";

export default function CreateTripSection() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition"
        >
          + Crear nuevo viaje
        </button>
      )}

      {showForm && (
        <div className="space-y-4">
          <CreateTripForm />

          <button
            onClick={() => setShowForm(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
