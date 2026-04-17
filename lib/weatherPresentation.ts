/** Etiqueta breve en español para códigos WMO de Open-Meteo (subconjunto habitual). */
export function wmoWeatherVisual(code: number | null): { emoji: string; label: string } {
  if (code == null) return { emoji: "—", label: "Sin dato" };
  if (code === 0) return { emoji: "☀️", label: "Despejado" };
  if (code <= 3) return { emoji: "⛅", label: "Nuboso" };
  if (code <= 48) return { emoji: "🌫️", label: "Niebla" };
  if (code <= 57) return { emoji: "🌦️", label: "Llovizna" };
  if (code <= 67) return { emoji: "🌧️", label: "Lluvia" };
  if (code <= 77) return { emoji: "🌨️", label: "Nieve" };
  if (code <= 82) return { emoji: "🌧️", label: "Chubascos" };
  if (code <= 86) return { emoji: "🌨️", label: "Chubascos nieve" };
  if (code <= 99) return { emoji: "⛈️", label: "Tormenta" };
  return { emoji: "🌤️", label: "Variable" };
}
