"use client";

import { useState } from "react";
import type { ProfileSearchResult, TripParticipant } from "@/hooks/useTripParticipants";
import { btnPrimary } from "@/components/ui/brandStyles";
import { Link2, Search, Loader2 } from "lucide-react";

type Props = {
  participant: TripParticipant;
  onSearchProfiles: (query: string) => Promise<ProfileSearchResult[]>;
  onLinkProfile: (profile: ProfileSearchResult) => Promise<void>;
};

export default function ParticipantLinkProfilePanel({
  participant,
  onSearchProfiles,
  onLinkProfile,
}: Props) {
  const [query, setQuery] = useState(participant.email ?? participant.username ?? participant.display_name);
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);

    try {
      const nextResults = await onSearchProfiles(query);
      setResults(nextResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar perfiles.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-900">
          <Link2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-extrabold text-slate-950">Vincular con usuario real</h4>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Busca un perfil existente para evitar duplicados cuando la persona ya se registró.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
            placeholder="username o email"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {results.map((profile) => (
          <div
            key={profile.id}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="text-sm font-extrabold text-slate-900">{profile.full_name || profile.username}</div>
              <div className="text-xs font-semibold text-slate-500">
                @{profile.username} · {profile.email || "sin email"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onLinkProfile(profile)}
              className={`${btnPrimary} inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm`}
            >
              <Link2 className="h-4 w-4" aria-hidden />
              Vincular
            </button>
          </div>
        ))}

        {!loading && results.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
            Sin resultados todavía. Prueba con email, @usuario o el nombre.
          </div>
        ) : null}
      </div>
    </div>
  );
}
