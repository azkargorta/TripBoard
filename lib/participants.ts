export type TripRole = "owner" | "editor" | "viewer";
export type ParticipantStatus = "active" | "pending" | "removed";
export type JoinedVia = "owner" | "manual" | "invite" | "whatsapp" | "linked";

export type ParticipantPermissions = {
  can_manage_trip: boolean;
  can_manage_participants: boolean;
  can_manage_expenses: boolean;
  can_manage_plan: boolean;
  can_manage_map: boolean;
  can_manage_resources: boolean;
};

export type TripParticipantRecord = {
  id: string;
  trip_id: string;
  display_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  joined_via: JoinedVia | string | null;
  user_id: string | null;
  role: TripRole;
  status: ParticipantStatus;
  linked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
} & ParticipantPermissions;

export const TRIP_ROLE_OPTIONS: { value: TripRole; label: string; description: string }[] = [
  {
    value: "owner",
    label: "Owner",
    description: "Control total del viaje y de los participantes.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Puede editar contenido del viaje, pero no gestionar miembros por defecto.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Solo lectura salvo permisos puntuales activados manualmente.",
  },
];

export const PARTICIPANT_STATUS_OPTIONS: {
  value: ParticipantStatus;
  label: string;
}[] = [
  { value: "active", label: "Activo" },
  { value: "pending", label: "Pendiente" },
  { value: "removed", label: "Eliminado" },
];

export function getDefaultPermissionsByRole(
  role: TripRole
): ParticipantPermissions {
  if (role === "owner") {
    return {
      can_manage_trip: true,
      can_manage_participants: true,
      can_manage_expenses: true,
      can_manage_plan: true,
      can_manage_map: true,
      can_manage_resources: true,
    };
  }

  if (role === "editor") {
    return {
      can_manage_trip: false,
      can_manage_participants: false,
      can_manage_expenses: true,
      can_manage_plan: true,
      can_manage_map: true,
      can_manage_resources: true,
    };
  }

  return {
    can_manage_trip: false,
    can_manage_participants: false,
    can_manage_expenses: false,
    can_manage_plan: false,
    can_manage_map: false,
    can_manage_resources: false,
  };
}

export function normalizePermissions(
  role: TripRole,
  overrides?: Partial<ParticipantPermissions>
): ParticipantPermissions {
  const defaults = getDefaultPermissionsByRole(role);

  // Misma lógica que `lib/permissions.ts`: flags en `false` en BD no deben dejar
  // al owner sin permisos por el operador `??`.
  if (role === "owner") {
    return { ...getDefaultPermissionsByRole("owner") };
  }

  return {
    can_manage_trip: overrides?.can_manage_trip ?? defaults.can_manage_trip,
    can_manage_participants:
      overrides?.can_manage_participants ?? defaults.can_manage_participants,
    can_manage_expenses:
      overrides?.can_manage_expenses ?? defaults.can_manage_expenses,
    can_manage_plan: overrides?.can_manage_plan ?? defaults.can_manage_plan,
    can_manage_map: overrides?.can_manage_map ?? defaults.can_manage_map,
    can_manage_resources:
      overrides?.can_manage_resources ?? defaults.can_manage_resources,
  };
}

export function getRoleLabel(role: TripRole) {
  return TRIP_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export function getStatusLabel(status: ParticipantStatus) {
  return (
    PARTICIPANT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string) {
  if (!phone?.trim()) return null;

  const normalizedPhone = phone.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const phoneWithoutPlus = normalizedPhone.replace(/^\+/, "");

  if (!phoneWithoutPlus) return null;

  return `https://wa.me/${phoneWithoutPlus}?text=${encodeURIComponent(message)}`;
}

export function getParticipantInitialValues(): TripParticipantRecord {
  const permissions = getDefaultPermissionsByRole("viewer");

  return {
    id: "",
    trip_id: "",
    display_name: "",
    username: null,
    email: null,
    phone: null,
    joined_via: "manual",
    user_id: null,
    role: "viewer",
    status: "active",
    linked_at: null,
    created_at: null,
    updated_at: null,
    ...permissions,
  };
}
