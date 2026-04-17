/**
 * Construye un instante local fiable para actividades del plan.
 * Evita duplicar ":00" cuando la BD ya guarda HH:MM:SS (rompía el Date y vaciaba "próximo plan").
 */
export function normalizeActivityTimeForIso(activityTime: string | null | undefined): string {
  if (!activityTime || !String(activityTime).trim()) return "23:59:59";
  const s = String(activityTime).trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  const m = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const ss = m[3] ?? "00";
    return `${m[1]}:${m[2]}:${ss}`;
  }
  return "23:59:59";
}

export type ActivityDateTimeInput = {
  activity_date: string | null;
  activity_time?: string | null;
};

export function parseActivityLocalMoment(activity: ActivityDateTimeInput): Date | null {
  if (!activity.activity_date) return null;
  const time = normalizeActivityTimeForIso(activity.activity_time ?? null);
  const value = new Date(`${activity.activity_date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}
