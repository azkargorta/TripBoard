"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_CURRENCIES } from "@/lib/currencies";
import type { ExpenseAnalysis, ExpenseFormInput } from "@/hooks/useTripExpenses";
import type { ExpenseDetectedData } from "@/components/trip/expenses/ExpenseAnalyzerPanel";

type ExistingExpense = {
  id: string;
  title?: string | null;
  category?: string | null;
  payer_name?: string | null;
  participant_names?: string[] | null;
  paid_by_names?: string[] | null;
  owed_by_names?: string[] | null;
  amount?: number | null;
  currency?: string | null;
  expense_date?: string | null;
  notes?: string | null;
  attachment_name?: string | null;
  analysis_data?: ExpenseAnalysis | null;
};

type Props = {
  saving?: boolean;
  existingParticipants: string[];
  registeredTravelers?: string[];
  editingExpense?: ExistingExpense | null;
  detectedData?: ExpenseDetectedData | null;
  onCancelEdit?: () => void;
  onSubmit: (input: ExpenseFormInput) => Promise<void>;
};

const CATEGORIES = [
  { value: "general", label: "General", icon: "💳" },
  { value: "food", label: "Comida", icon: "🍽️" },
  { value: "transport", label: "Transporte", icon: "🚆" },
  { value: "lodging", label: "Alojamiento", icon: "🏨" },
  { value: "tickets", label: "Entradas", icon: "🎟️" },
  { value: "shopping", label: "Compras", icon: "🛍️" },
];

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNameArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeName).filter(Boolean);
}

export default function ExpenseForm({
  saving = false,
  existingParticipants,
  registeredTravelers = [],
  editingExpense = null,
  detectedData = null,
  onCancelEdit,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [payerName, setPayerName] = useState("");
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [paidByNames, setPaidByNames] = useState<string[]>([]);
  const [owedByNames, setOwedByNames] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [keepExistingAttachment, setKeepExistingAttachment] = useState(true);
  const [analysisData, setAnalysisData] = useState<ExpenseAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(editingExpense?.id);

  const travelerOptions = useMemo(() => {
    const set = new Set<string>();
    [...registeredTravelers, ...existingParticipants].forEach((item) => {
      const clean = normalizeName(item);
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingParticipants, registeredTravelers]);

  useEffect(() => {
    if (!editingExpense) return;
    setTitle(editingExpense.title || "");
    setCategory(editingExpense.category || "general");
    setPayerName(editingExpense.payer_name || "");
    setParticipantNames(normalizeNameArray(editingExpense.participant_names));
    setPaidByNames(normalizeNameArray(editingExpense.paid_by_names));
    setOwedByNames(normalizeNameArray(editingExpense.owed_by_names));
    setAmount(editingExpense.amount != null ? String(editingExpense.amount) : "");
    setCurrency(editingExpense.currency || "EUR");
    setExpenseDate(editingExpense.expense_date || "");
    setNotes(editingExpense.notes || "");
    setKeepExistingAttachment(Boolean(editingExpense.attachment_name));
    setAnalysisData(editingExpense.analysis_data || null);
    setAttachment(null);
  }, [editingExpense]);

  useEffect(() => {
    if (!detectedData || isEditing) return;
    if (detectedData.title) setTitle(detectedData.title);
    if (detectedData.category) setCategory(detectedData.category);
    if (detectedData.amount != null) setAmount(String(detectedData.amount));
    if (detectedData.currency) setCurrency(detectedData.currency);
    if (detectedData.expenseDate) setExpenseDate(detectedData.expenseDate);
    if (detectedData.file) setAttachment(detectedData.file);
    // No guardamos el File dentro de analysis_data (rompe JSON / DB y no aporta valor).
    const { file: _file, ...safeAnalysis } = detectedData as any;
    setAnalysisData(safeAnalysis);
  }, [detectedData, isEditing]);

  function toggleParticipant(name: string) {
    setParticipantNames((current) => {
      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];

      setPaidByNames((prev) => prev.filter((item) => next.includes(item)));
      setOwedByNames((prev) => prev.filter((item) => next.includes(item)));
      return next;
    });
  }

  function toggleIn(target: "paid" | "owed", name: string) {
    const setter = target === "paid" ? setPaidByNames : setOwedByNames;
    setter((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  }

  function setAllParticipantsAsDebtors() {
    setOwedByNames([...participantNames]);
  }

  function setOnlyPayerAsPaid() {
    const clean = normalizeName(payerName);
    if (!clean) return;
    if (!participantNames.includes(clean)) {
      setParticipantNames((current) => [...current, clean]);
    }
    setPaidByNames([clean]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const numericAmount = Number(amount);

    if (!title.trim()) {
      setError("Introduce el nombre del gasto.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("El importe no es válido.");
      return;
    }

    try {
      await Promise.race([
        onSubmit({
          id: editingExpense?.id,
          title: title.trim(),
          category,
          payerName: payerName.trim(),
          participantNames,
          paidByNames,
          owedByNames,
          amount: numericAmount,
          currency,
          expenseDate,
          notes,
          attachment,
          keepExistingAttachment,
          analysisData,
        }),
        new Promise<void>((_resolve, reject) =>
          window.setTimeout(() => reject(new Error("El guardado está tardando demasiado (timeout).")), 25000)
        ),
      ]);

      if (!isEditing) {
        setTitle("");
        setCategory("general");
        setPayerName("");
        setParticipantNames([]);
        setPaidByNames([]);
        setOwedByNames([]);
        setAmount("");
        setCurrency("EUR");
        setExpenseDate("");
        setNotes("");
        setAttachment(null);
        setKeepExistingAttachment(true);
        setAnalysisData(null);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo guardar el gasto.";
      setError(msg);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          <span>💸</span>
          <span>{isEditing ? "Editar gasto" : "Nuevo gasto"}</span>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">
          {isEditing ? "Editar gasto" : "Añadir gasto"}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {saving ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Guardando… Si esto tarda más de 20s, suele ser un problema de permisos/bucket al subir el adjunto.
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Concepto</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.icon} {item.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Quién ha pagado</span>
            <select value={payerName} onChange={(e) => setPayerName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="">Sin definir</option>
              {travelerOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div className="mt-2">
              <button type="button" onClick={setOnlyPayerAsPaid} className="text-xs font-semibold text-slate-600 underline underline-offset-2">
                Usar este viajero como pagador real
              </button>
            </div>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Importe</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Moneda</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              {ALL_CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>{item.code} · {item.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Fecha</span>
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-800">Viajeros registrados</div>
          <p className="mt-1 text-sm text-slate-500">
            Marca los viajeros implicados y luego decide entre cuáles se ha pagado y entre cuáles se reparte.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {travelerOptions.length === 0 ? (
              <p className="text-sm text-slate-500">No se han encontrado viajeros registrados.</p>
            ) : (
              travelerOptions.map((name) => (
                <label key={name} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  <input type="checkbox" checked={participantNames.includes(name)} onChange={() => toggleParticipant(name)} />
                  <span>{name}</span>
                </label>
              ))
            )}
          </div>

          {participantNames.length ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={setAllParticipantsAsDebtors} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                  Repartir entre todos los viajeros seleccionados
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {participantNames.map((name) => (
                  <div key={name} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="font-semibold text-slate-900">{name}</div>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={paidByNames.includes(name)} onChange={() => toggleIn("paid", name)} />
                        <span>Ha pagado</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={owedByNames.includes(name)} onChange={() => toggleIn("owed", name)} />
                        <span>Participa en el reparto</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-800">Archivo adjunto</div>
          {isEditing && editingExpense?.attachment_name ? (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={keepExistingAttachment} onChange={(e) => setKeepExistingAttachment(e.target.checked)} />
              <span>Mantener archivo actual: {editingExpense.attachment_name}</span>
            </label>
          ) : null}
          <input type="file" accept="image/*,.pdf" onChange={(e) => setAttachment(e.target.files?.[0] || null)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          {attachment ? <div className="text-sm text-slate-600">Nuevo archivo: {attachment.name}</div> : null}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Notas</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className={`rounded-xl px-4 py-3 text-sm font-semibold ${saving ? "bg-slate-200 text-slate-500" : "bg-slate-950 text-white"}`}>
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar gasto"}
          </button>
          {isEditing && onCancelEdit ? (
            <button type="button" onClick={onCancelEdit} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
