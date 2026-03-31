import { buildBalances, type TripExpenseBalanceInput } from "@/lib/expense-balance";

type UnknownRecord = Record<string, unknown>;

type ParticipantLike = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
};

type ProfileLike = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  email?: string | null;
};

type ExpenseLike = TripExpenseBalanceInput & {
  paid_by_participant_id?: string | null;
  split_between?: unknown;
  participant_ids?: unknown;
  participant_id?: string | null;
  payer_id?: string | null;
  user_id?: string | null;
};

type Params = {
  currentParticipant?: ParticipantLike | null;
  currentProfile?: ProfileLike | null;
  expenses?: ExpenseLike[] | null;
  participants?: ParticipantLike[] | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pushCandidate(target: Set<string>, value: unknown) {
  const normalized = normalize(value);
  if (!normalized) return;
  target.add(normalized);

  const firstWord = normalized.split(" ")[0];
  if (firstWord && firstWord.length >= 3) {
    target.add(firstWord);
  }

  const withoutEmailDomain = normalized.includes("@") ? normalized.split("@")[0] : "";
  if (withoutEmailDomain) {
    target.add(withoutEmailDomain);
  }
}

function collectIdentitySet(
  currentParticipant?: ParticipantLike | null,
  currentProfile?: ProfileLike | null,
  participants?: ParticipantLike[] | null
) {
  const identities = new Set<string>();

  const sources = [currentParticipant, currentProfile];
  for (const source of sources) {
    if (!source) continue;
    pushCandidate(identities, source.id);
    pushCandidate(identities, source.user_id);
    pushCandidate(identities, source.username);
    pushCandidate(identities, source.display_name);
    pushCandidate(identities, source.full_name);
    pushCandidate(identities, source.name);
    pushCandidate(identities, source.email);
  }

  const participantId = normalize(currentParticipant?.id);
  const participantUserId = normalize(currentParticipant?.user_id || currentProfile?.id || currentProfile?.user_id);

  for (const participant of participants ?? []) {
    const sameParticipant = participantId && normalize(participant.id) === participantId;
    const sameUser = participantUserId && normalize(participant.user_id) === participantUserId;
    const sameDisplayName = identities.has(normalize(participant.display_name));
    const sameUsername = identities.has(normalize(participant.username));

    if (sameParticipant || sameUser || sameDisplayName || sameUsername) {
      pushCandidate(identities, participant.id);
      pushCandidate(identities, participant.user_id);
      pushCandidate(identities, participant.username);
      pushCandidate(identities, participant.display_name);
      pushCandidate(identities, participant.full_name);
      pushCandidate(identities, participant.name);
      pushCandidate(identities, participant.email);
    }
  }

  return identities;
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalize).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map(normalize)
        .filter(Boolean);
    }
  }

  return [];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function computePersonalBalance({
  currentParticipant,
  currentProfile,
  expenses,
  participants,
}: Params) {
  const safeExpenses = (expenses ?? []).filter(Boolean);
  const identities = collectIdentitySet(currentParticipant, currentProfile, participants);

  const nameBasedRows = buildBalances(
    safeExpenses.map((expense) => ({
      id: String(expense.id ?? crypto.randomUUID?.() ?? Math.random()),
      title: expense.title ?? null,
      payer_name: expense.payer_name ?? null,
      participant_names: expense.participant_names ?? null,
      paid_by_names: expense.paid_by_names ?? null,
      owed_by_names: expense.owed_by_names ?? null,
      amount: Number(expense.amount ?? 0) || 0,
      currency: expense.currency ?? "EUR",
    }))
  );

  let paid = 0;
  let owed = 0;
  let matchedBy: "name" | "id" | "none" = "none";

  for (const row of nameBasedRows) {
    if (identities.has(normalize(row.person))) {
      paid += Number(row.paid || 0);
      owed += Number(row.owed || 0);
      matchedBy = "name";
    }
  }

  if (matchedBy === "none") {
    for (const expense of safeExpenses) {
      const amount = Number(expense.amount ?? 0) || 0;
      if (amount <= 0) continue;

      const payerIds = [
        expense.paid_by_participant_id,
        expense.participant_id,
        expense.payer_id,
        expense.user_id,
      ]
        .map(normalize)
        .filter(Boolean);

      const splitBetween = [
        ...normalizeStringArray(expense.split_between),
        ...normalizeStringArray(expense.participant_ids),
      ];

      if (payerIds.some((value) => identities.has(value))) {
        paid += amount;
        matchedBy = "id";
      }

      if (splitBetween.length) {
        const matchingShares = splitBetween.filter((value) => identities.has(value)).length;
        if (matchingShares > 0) {
          owed += (amount / splitBetween.length) * matchingShares;
          matchedBy = "id";
        }
      }
    }
  }

  paid = round2(paid);
  owed = round2(owed);

  return {
    paid,
    owed,
    net: round2(paid - owed),
    matchedBy,
    identities: Array.from(identities),
  };
}
