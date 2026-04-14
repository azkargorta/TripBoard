export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-slate-950 text-white">
      <div className="flex min-h-[100svh] flex-col items-center justify-center px-6">
        <img
          src="/icons/icon-512.png"
          alt="Kaviro"
          className="h-24 w-24 rounded-[28px] object-cover shadow-2xl"
        />
        <h1
          className="mt-6 text-3xl font-black tracking-tight"
          style={{
            backgroundImage: "linear-gradient(135deg, #2563eb, #06b6d4)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Kaviro
        </h1>
        <p className="mt-2 max-w-xs text-center text-sm text-slate-300">
          Preparando tu viaje, rutas, gastos y documentos…
        </p>

        <div className="mt-8 h-2 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-500" />
        </div>
      </div>
    </div>
  );
}
