"use client";

import { useState } from "react";
import type { ProfileSearchResult, TripParticipant } from "@/hooks/useTripParticipants";

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
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-3">
        <h4 className="font-semibold">Vincular con usuario real</h4>
        <p className="text-sm text-gray-500">
          Busca un perfil existente para evitar duplicados cuando la persona ya se registró.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 rounded-xl border px-3 py-2"
          placeholder="username o email"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="rounded-xl border px-4 py-2"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {results.map((profile) => (
          <div
            key={profile.id}
            className="flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="font-medium">{profile.full_name || profile.username}</div>
              <div className="text-sm text-gray-500">
                @{profile.username} · {profile.email}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onLinkProfile(profile)}
              className="rounded-xl bg-black px-3 py-2 text-sm text-white"
            >
              Vincular
            </button>
          </div>
        ))}

        {!loading && results.length === 0 ? (
          <div className="text-sm text-gray-500">Sin resultados todavía.</div>
        ) : null}
      </div>
    </div>
  );
}
