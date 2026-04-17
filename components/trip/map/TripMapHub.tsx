"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TripMapView from "@/components/trip/map/TripMapView";
import TripExploreView from "@/components/trip/explore/TripExploreView";

type Props = React.ComponentProps<typeof TripMapView> & {
  tripId: string;
};

type ViewId = "routes" | "explore";

function normalizeView(raw: string | null): ViewId {
  const v = (raw || "").trim().toLowerCase();
  return v === "explore" ? "explore" : "routes";
}

export default function TripMapHub({ tripId, ...mapProps }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initial = useMemo(() => normalizeView(searchParams.get("view")), [searchParams]);
  const [view, setView] = useState<ViewId>(initial);

  useEffect(() => {
    setView(normalizeView(searchParams.get("view")));
  }, [searchParams]);

  function setViewAndUrl(next: ViewId) {
    setView(next);
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "explore") sp.set("view", "explore");
    else sp.delete("view");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewAndUrl("routes")}
          className={`inline-flex min-h-[40px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
            view === "routes"
              ? "border-cyan-200 bg-cyan-50 text-cyan-900"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          }`}
          aria-pressed={view === "routes"}
        >
          Rutas y plan
        </button>
        <button
          type="button"
          onClick={() => setViewAndUrl("explore")}
          className={`inline-flex min-h-[40px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
            view === "explore"
              ? "border-violet-200 bg-violet-50 text-violet-900"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          }`}
          aria-pressed={view === "explore"}
        >
          Explorar y guardar
        </button>
      </div>

      {view === "explore" ? <TripExploreView tripId={tripId} /> : <TripMapView tripId={tripId} {...mapProps} />}
    </section>
  );
}

