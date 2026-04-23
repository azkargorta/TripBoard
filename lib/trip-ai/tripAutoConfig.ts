export type TripAutoGeoStrictness = "strict" | "balanced" | "loose";

export type TripAutoConfig = {
  pace: {
    itemsPerDayMin: number;
    itemsPerDayMax: number;
  };
  geo: {
    strictness: TripAutoGeoStrictness;
  };
  transport: {
    notes: string;
  };
  lodging: {
    mode: "proposal" | "manual" | "scan" | "omit";
    baseCityMode: "rotate" | "single";
    baseCity: string;
  };
  routes: {
    enabled: boolean;
  };
};

export const DEFAULT_TRIP_AUTO_CONFIG: TripAutoConfig = {
  pace: { itemsPerDayMin: 3, itemsPerDayMax: 5 },
  geo: { strictness: "balanced" },
  transport: { notes: "" },
  lodging: { mode: "proposal", baseCityMode: "rotate", baseCity: "" },
  routes: { enabled: true },
};

export function normalizeTripAutoConfig(input: unknown): TripAutoConfig {
  const i = (input || {}) as any;
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: any) => (typeof v === "string" ? v : "");
  const bool = (v: any) => Boolean(v);

  const strictnessRaw = str(i?.geo?.strictness || i?.geoStrictness || "");
  const strictness: TripAutoGeoStrictness =
    strictnessRaw === "strict" || strictnessRaw === "loose" || strictnessRaw === "balanced"
      ? strictnessRaw
      : DEFAULT_TRIP_AUTO_CONFIG.geo.strictness;

  const min = num(i?.pace?.itemsPerDayMin) ?? DEFAULT_TRIP_AUTO_CONFIG.pace.itemsPerDayMin;
  const max = num(i?.pace?.itemsPerDayMax) ?? DEFAULT_TRIP_AUTO_CONFIG.pace.itemsPerDayMax;
  const itemsPerDayMin = Math.max(1, Math.min(12, Math.round(min)));
  const itemsPerDayMax = Math.max(itemsPerDayMin, Math.min(12, Math.round(max)));

  const lodgingModeRaw = str(i?.lodging?.mode || "");
  const lodgingMode: TripAutoConfig["lodging"]["mode"] =
    lodgingModeRaw === "manual" || lodgingModeRaw === "scan" || lodgingModeRaw === "omit" || lodgingModeRaw === "proposal"
      ? lodgingModeRaw
      : DEFAULT_TRIP_AUTO_CONFIG.lodging.mode;

  const baseCityModeRaw = str(i?.lodging?.baseCityMode || i?.lodgingBaseCityMode || "");
  const baseCityMode: TripAutoConfig["lodging"]["baseCityMode"] =
    baseCityModeRaw === "single" || baseCityModeRaw === "rotate" ? baseCityModeRaw : DEFAULT_TRIP_AUTO_CONFIG.lodging.baseCityMode;
  const baseCity = str(i?.lodging?.baseCity || i?.lodgingBaseCity || DEFAULT_TRIP_AUTO_CONFIG.lodging.baseCity).trim();

  return {
    pace: { itemsPerDayMin, itemsPerDayMax },
    geo: { strictness },
    transport: { notes: str(i?.transport?.notes || "") },
    lodging: { mode: lodgingMode, baseCityMode, baseCity },
    routes: { enabled: bool(i?.routes?.enabled ?? DEFAULT_TRIP_AUTO_CONFIG.routes.enabled) },
  };
}

