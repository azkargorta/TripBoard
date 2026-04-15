"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
};

type ToastInput = Omit<Toast, "id"> & { id?: string; durationMs?: number };

type ToastApi = {
  push: (t: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function styles(kind: ToastKind) {
  if (kind === "success") {
    return {
      wrap: "border-emerald-200 bg-emerald-50 text-emerald-950",
      dot: "bg-emerald-500",
      title: "text-emerald-950",
      desc: "text-emerald-900/80",
    };
  }
  if (kind === "error") {
    return {
      wrap: "border-rose-200 bg-rose-50 text-rose-950",
      dot: "bg-rose-500",
      title: "text-rose-950",
      desc: "text-rose-900/80",
    };
  }
  return {
    wrap: "border-slate-200 bg-white text-slate-950",
    dot: "bg-slate-500",
    title: "text-slate-950",
    desc: "text-slate-600",
  };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = input.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const durationMs = typeof input.durationMs === "number" ? input.durationMs : 3200;
      const toast: Toast = {
        id,
        kind: input.kind,
        title: input.title,
        description: input.description,
      };

      setToasts((prev) => {
        const next = [toast, ...prev].slice(0, 4);
        return next;
      });

      const timer = window.setTimeout(() => remove(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, description) => push({ kind: "success", title, description }),
      error: (title, description) => push({ kind: "error", title, description, durationMs: 4500 }),
      info: (title, description) => push({ kind: "info", title, description }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] w-[min(420px,calc(100vw-2rem))] space-y-3">
        {toasts.map((t) => {
          const s = styles(t.kind);
          return (
            <div
              key={t.id}
              role="status"
              className={`rounded-2xl border p-4 shadow-lg ${s.wrap}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
                  <div>
                    <div className={`text-sm font-bold ${s.title}`}>{t.title}</div>
                    {t.description ? (
                      <div className={`mt-1 text-sm ${s.desc}`}>{t.description}</div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="rounded-xl border border-black/10 bg-white/60 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  Cerrar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}

