export type TripExpenseBalanceInput = {
  id: string;
  title?: string | null;
  payer_name?: string | null;
  participant_names?: unknown;
  paid_by_names?: unknown;
  owed_by_names?: unknown;
  amount: number | string | null;
  currency: string | null;
};

export type BalanceRow = {
  person: string;
  balance: number;
  paid: number;
  owed: number;
};

export type SettlementSuggestion = {
  id: string;
  debtor_name: string;
  creditor_name: string;
  amount: number;
  currency: string;
  status: "pending" | "paid";
  source_balance_key: string;
  payment_method?: "bizum" | "transfer" | "cash" | null;
};

function normalizeAmount(value: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCurrency(value: string | null | undefined) {
  const code = (value || "EUR").toUpperCase().trim();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type PaymentMethod = "bizum" | "transfer" | "cash";

export type PaymentPreferenceRow = {
  participant_name: string;
  send_methods: PaymentMethod[];
  receive_methods: PaymentMethod[];
};

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

function methodCost(method: PaymentMethod) {
  // Preferimos Bizum, luego transferencia, luego efectivo.
  if (method === "bizum") return 1;
  if (method === "transfer") return 2;
  return 3;
}

type Edge = { to: number; rev: number; cap: number; cost: number };

function addEdge(graph: Edge[][], u: number, v: number, cap: number, cost: number) {
  graph[u].push({ to: v, rev: graph[v].length, cap, cost });
  graph[v].push({ to: u, rev: graph[u].length - 1, cap: 0, cost: -cost });
}

function minCostMaxFlow(graph: Edge[][], s: number, t: number, maxFlow: number) {
  const n = graph.length;
  const dist = new Array<number>(n);
  const prevV = new Array<number>(n);
  const prevE = new Array<number>(n);
  const potential = new Array<number>(n).fill(0);

  let flow = 0;
  let cost = 0;

  while (flow < maxFlow) {
    dist.fill(Number.POSITIVE_INFINITY);
    dist[s] = 0;
    const inq = new Array<boolean>(n).fill(false);
    const q: number[] = [s];
    inq[s] = true;

    // SPFA (n pequeño)
    while (q.length) {
      const v = q.shift() as number;
      inq[v] = false;
      for (let i = 0; i < graph[v].length; i += 1) {
        const e = graph[v][i];
        if (e.cap <= 0) continue;
        const nd = dist[v] + e.cost + potential[v] - potential[e.to];
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prevV[e.to] = v;
          prevE[e.to] = i;
          if (!inq[e.to]) {
            q.push(e.to);
            inq[e.to] = true;
          }
        }
      }
    }

    if (!Number.isFinite(dist[t])) break;

    for (let v = 0; v < n; v += 1) {
      if (Number.isFinite(dist[v])) potential[v] += dist[v];
    }

    let add = maxFlow - flow;
    for (let v = t; v !== s; v = prevV[v]) {
      add = Math.min(add, graph[prevV[v]][prevE[v]].cap);
    }
    for (let v = t; v !== s; v = prevV[v]) {
      const pv = prevV[v];
      const pe = prevE[v];
      const e = graph[pv][pe];
      e.cap -= add;
      graph[v][e.rev].cap += add;
      cost += add * e.cost;
    }
    flow += add;
  }

  return { flow, cost };
}

export function buildSettlementSuggestionsWithMethods(
  balances: BalanceRow[],
  currency: string,
  preferences: PaymentPreferenceRow[] | null | undefined,
  strict: boolean
): { settlements: SettlementSuggestion[]; ok: boolean; warning: string | null } {
  const safeCurrency = normalizeCurrency(currency);

  const prefMap = new Map<string, PaymentPreferenceRow>();
  for (const p of preferences || []) {
    if (p?.participant_name) prefMap.set(p.participant_name, p);
  }

  const debtors = balances
    .filter((row) => row.balance < -0.009)
    .map((row) => ({ name: row.person, amountCents: toCents(Math.abs(row.balance)) }))
    .filter((d) => d.amountCents > 0);

  const creditors = balances
    .filter((row) => row.balance > 0.009)
    .map((row) => ({ name: row.person, amountCents: toCents(row.balance) }))
    .filter((c) => c.amountCents > 0);

  const totalDemand = debtors.reduce((s, d) => s + d.amountCents, 0);
  const totalSupply = creditors.reduce((s, c) => s + c.amountCents, 0);
  const total = Math.min(totalDemand, totalSupply);
  if (total <= 0) return { settlements: [], ok: true, warning: null };

  // Si no hay preferencias, usa el algoritmo actual.
  if (!preferences?.length) {
    return { settlements: buildSettlementSuggestions(balances, safeCurrency), ok: true, warning: null };
  }

  // Grafo: s -> debtors -> creditors (por método) -> t
  // Modelamos método como coste y lo elegimos en reconstrucción.
  const s = 0;
  const debtorOffset = 1;
  const creditorOffset = debtorOffset + debtors.length;
  const t = creditorOffset + creditors.length;
  const graph: Edge[][] = Array.from({ length: t + 1 }, () => []);

  for (let i = 0; i < debtors.length; i += 1) {
    addEdge(graph, s, debtorOffset + i, debtors[i].amountCents, 0);
  }
  for (let j = 0; j < creditors.length; j += 1) {
    addEdge(graph, creditorOffset + j, t, creditors[j].amountCents, 0);
  }

  const allMethods: PaymentMethod[] = ["bizum", "transfer", "cash"];
  const edgeMeta = new Map<string, { debtor: string; creditor: string; method: PaymentMethod }>();

  for (let i = 0; i < debtors.length; i += 1) {
    const debtor = debtors[i];
    const debtorPref = prefMap.get(debtor.name);
    const send = debtorPref?.send_methods?.length ? debtorPref.send_methods : allMethods;

    for (let j = 0; j < creditors.length; j += 1) {
      const creditor = creditors[j];
      const creditorPref = prefMap.get(creditor.name);
      const recv = creditorPref?.receive_methods?.length ? creditorPref.receive_methods : allMethods;

      const intersection = send.filter((m) => recv.includes(m));
      if (!intersection.length) continue;

      // Creamos una arista por método (para poder escoger método).
      for (const method of intersection) {
        const u = debtorOffset + i;
        const v = creditorOffset + j;
        const cap = Math.min(debtor.amountCents, creditor.amountCents);
        const cost = methodCost(method) * 10 + 1; // +1 favorece menos transferencias
        const key = `${u}->${v}:${method}:${graph[u].length}`;
        addEdge(graph, u, v, cap, cost);
        edgeMeta.set(key, { debtor: debtor.name, creditor: creditor.name, method });
      }
    }
  }

  const { flow } = minCostMaxFlow(graph, s, t, total);

  if (flow < total) {
    if (!strict) {
      return {
        settlements: buildSettlementSuggestions(balances, safeCurrency),
        ok: true,
        warning:
          "No se pudo cumplir todas las restricciones de métodos; se han ignorado para poder saldar las cuentas.",
      };
    }
    return {
      settlements: [],
      ok: false,
      warning:
        "Con las restricciones de métodos actuales no se puede saldar el balance al 100%. Ajusta métodos disponibles o desactiva el modo estricto.",
    };
  }

  // Reconstrucción: miramos flujo en aristas debtor->creditor (cap consumida).
  const agg = new Map<string, { amountCents: number; method: PaymentMethod }>();
  for (let u = debtorOffset; u < creditorOffset; u += 1) {
    for (let ei = 0; ei < graph[u].length; ei += 1) {
      const e = graph[u][ei];
      if (e.to < creditorOffset || e.to >= t) continue;
      const rev = graph[e.to][e.rev];
      const sent = rev.cap; // lo que volvió por el reverse = flujo enviado
      if (sent <= 0) continue;

      // Encontrar meta: reconstruimos la key igual que la creación (por índice).
      // Como el grafo se ha mutado, usamos el método más barato disponible por inspección de coste.
      const creditorIndex = e.to - creditorOffset;
      const debtorIndex = u - debtorOffset;
      const debtorName = debtors[debtorIndex]?.name;
      const creditorName = creditors[creditorIndex]?.name;
      if (!debtorName || !creditorName) continue;

      // Inferimos método por coste (methodCost*10+1)
      const method = ((): PaymentMethod => {
        const raw = Math.floor((e.cost - 1) / 10);
        if (raw === 1) return "bizum";
        if (raw === 2) return "transfer";
        return "cash";
      })();

      const k = `${debtorName}->${creditorName}:${method}`;
      const current = agg.get(k) || { amountCents: 0, method };
      current.amountCents += sent;
      agg.set(k, current);
    }
  }

  const settlements: SettlementSuggestion[] = Array.from(agg.entries())
    .map(([key, row]) => {
      const [pair, method] = key.split(":");
      const [debtor_name, creditor_name] = pair.split("->");
      const amount = fromCents(row.amountCents);
      return {
        id: `${debtor_name}->${creditor_name}:${amount}`,
        debtor_name,
        creditor_name,
        amount,
        currency: safeCurrency,
        status: "pending" as const,
        source_balance_key: `${debtor_name}->${creditor_name}`,
        payment_method: method as PaymentMethod,
      };
    })
    .filter((s) => s.amount > 0.009)
    .sort((a, b) => a.debtor_name.localeCompare(b.debtor_name) || a.creditor_name.localeCompare(b.creditor_name));

  return { settlements, ok: true, warning: null };
}

export function buildBalances(expenses: TripExpenseBalanceInput[]) {
  const map = new Map<string, { balance: number; paid: number; owed: number }>();

  for (const e of expenses) {
    const amount = normalizeAmount(e.amount);
    const participants = normalizeNames(e.participant_names);
    const paidBy = normalizeNames(e.paid_by_names);
    const owedBy = normalizeNames(e.owed_by_names);

    const debtors = owedBy.length ? owedBy : participants;
    const payers = paidBy.length ? paidBy : (e.payer_name ? [e.payer_name] : []);

    if (!debtors.length && !payers.length) continue;

    if (debtors.length) {
      const split = amount / debtors.length;
      for (const debtor of debtors) {
        const current = map.get(debtor) || { balance: 0, paid: 0, owed: 0 };
        current.balance -= split;
        current.owed += split;
        map.set(debtor, current);
      }
    }

    if (payers.length) {
      const split = amount / payers.length;
      for (const payer of payers) {
        const current = map.get(payer) || { balance: 0, paid: 0, owed: 0 };
        current.balance += split;
        current.paid += split;
        map.set(payer, current);
      }
    }
  }

  return Array.from(map.entries())
    .map(([person, row]) => ({
      person,
      balance: round2(row.balance),
      paid: round2(row.paid),
      owed: round2(row.owed),
    }))
    .sort((a, b) => a.person.localeCompare(b.person));
}

export function buildSettlementSuggestions(
  expensesOrBalances: TripExpenseBalanceInput[] | BalanceRow[],
  currency: string = "EUR"
): SettlementSuggestion[] {
  const balances: BalanceRow[] =
    expensesOrBalances.length > 0 && "person" in (expensesOrBalances[0] as any)
      ? (expensesOrBalances as BalanceRow[])
      : buildBalances(expensesOrBalances as TripExpenseBalanceInput[]);

  const debtors = balances
    .filter((row) => row.balance < 0)
    .map((row) => ({ name: row.person, amount: Math.abs(row.balance) }));

  const creditors = balances
    .filter((row) => row.balance > 0)
    .map((row) => ({ name: row.person, amount: row.balance }));

  const settlements: SettlementSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  const safeCurrency = normalizeCurrency(currency);

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = round2(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      settlements.push({
        id: `${debtor.name}->${creditor.name}:${amount}`,
        debtor_name: debtor.name,
        creditor_name: creditor.name,
        amount,
        currency: safeCurrency,
        status: "pending",
        source_balance_key: `${debtor.name}->${creditor.name}`,
      });
    }

    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);

    if (debtor.amount <= 0.009) debtorIndex += 1;
    if (creditor.amount <= 0.009) creditorIndex += 1;
  }

  return settlements;
}
