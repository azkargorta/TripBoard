"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!visible || !deferredPrompt) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setVisible(false);
    setDeferredPrompt(null);
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <img
          src="/icons/icon-192.png"
          alt="Kaviro"
          className="h-16 w-16 rounded-2xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Instala Kaviro</p>
          <p className="mt-1 text-sm text-slate-600">
            Añade la app a tu móvil para abrirla como una aplicación de verdad.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleInstall}
          className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
        >
          Instalar app
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
        >
          Más tarde
        </button>
      </div>
    </div>
  );
}
