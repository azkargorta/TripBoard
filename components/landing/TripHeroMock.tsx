/**
 * Mock visual estático para la landing: refuerza “un solo lugar” sin datos reales.
 */
export default function TripHeroMock() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Ejemplo</p>
          <p className="mt-0.5 text-sm font-bold text-slate-950">Londres · 4 días</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Todo junto</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <p className="text-xs font-bold text-slate-800">Día 1</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            <li className="flex gap-2">
              <span className="font-mono text-slate-400">10:00</span>
              <span>Museo + paseo</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-slate-400">14:30</span>
              <span>Comida en zona céntrica</span>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <p className="text-xs font-bold text-slate-800">Día 2</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            <li className="flex gap-2">
              <span className="font-mono text-slate-400">09:30</span>
              <span>Ruta en mapa · gastos compartidos</span>
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-500">Así se ve la idea: un solo lienzo para el viaje.</p>
    </div>
  );
}
