/** Pasos mostrados en el dashboard y guía del formulario (usuarios no Premium). */
export const FREE_PLAN_CREATION_STEPS: readonly { label: string; hint: string }[] = [
  {
    label: "Crear viaje",
    hint: "Rellena nombre, lugares, fechas y moneda, y pulsa Crear viaje. Entrarás al resumen del viaje.",
  },
  {
    label: "Añade Planes",
    hint: "En la pestaña Plan añade actividades, horarios y notas para cada día.",
  },
  {
    label: "Calcula rutas",
    hint: "En Mapa o Rutas une los puntos del itinerario y genera recorridos entre paradas.",
  },
  {
    label: "Añade viajeros",
    hint: "En Participantes invita por email a quien viaja contigo y define permisos.",
  },
  {
    label: "Introduce documentos",
    hint: "En Recursos sube billetes, reservas o PDFs para tenerlos a mano (el análisis OCR automático es Premium).",
  },
  {
    label: "Añade gastos",
    hint: "En Gastos registra pagos y repartos para llevar el presupuesto del grupo.",
  },
];
