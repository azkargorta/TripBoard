export type TripRole = "owner" | "editor" | "viewer";

export type ParticipantPermissions = {
  can_manage_trip: boolean;
  can_manage_participants: boolean;
  can_manage_expenses: boolean;
  can_manage_plan: boolean;
  can_manage_map: boolean;
  can_manage_resources: boolean;
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<TripRole, ParticipantPermissions> = {
  owner: {
    can_manage_trip: true,
    can_manage_participants: true,
    can_manage_expenses: true,
    can_manage_plan: true,
    can_manage_map: true,
    can_manage_resources: true,
  },
  editor: {
    can_manage_trip: false,
    can_manage_participants: false,
    can_manage_expenses: true,
    can_manage_plan: true,
    can_manage_map: true,
    can_manage_resources: true,
  },
  viewer: {
    can_manage_trip: false,
    can_manage_participants: false,
    can_manage_expenses: false,
    can_manage_plan: false,
    can_manage_map: false,
    can_manage_resources: false,
  },
};

export function normalizeRole(role?: string | null): TripRole {
  if (role === "owner" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

export function normalizePermissions(
  role?: string | null,
  overrides?: Partial<ParticipantPermissions> | null
): ParticipantPermissions {
  const normalizedRole = normalizeRole(role);
  const base = DEFAULT_PERMISSIONS_BY_ROLE[normalizedRole];

  return {
    can_manage_trip: overrides?.can_manage_trip ?? base.can_manage_trip,
    can_manage_participants:
      overrides?.can_manage_participants ?? base.can_manage_participants,
    can_manage_expenses:
      overrides?.can_manage_expenses ?? base.can_manage_expenses,
    can_manage_plan: overrides?.can_manage_plan ?? base.can_manage_plan,
    can_manage_map: overrides?.can_manage_map ?? base.can_manage_map,
    can_manage_resources:
      overrides?.can_manage_resources ?? base.can_manage_resources,
  };
}
