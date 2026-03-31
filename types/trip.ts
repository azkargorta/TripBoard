export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
};

export type Activity = {
  id: string;
  trip_id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  place: string | null;
  place_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  sort_order?: number | null;
  created_at?: string | null;
};

export type SavedRoute = {
  id: string;
  trip_id: string;
  name: string;
  origin_activity_id: string | null;
  destination_activity_id: string | null;
  travel_mode: "DRIVING" | "TRANSIT" | "WALKING";
  distance_text: string | null;
  duration_text: string | null;
  waypoint_ids: string[] | null;
  route_date: string | null;
  route_start_time?: string | null;
  created_at?: string;
};

export type Accommodation = {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  check_in_date: string | null;
  check_out_date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  confirmation_code: string | null;
  notes: string | null;
  activity_id: string | null;
  created_at?: string | null;
};

export type ExpenseCategory =
  | "general"
  | "food"
  | "transport"
  | "hotel"
  | "activities"
  | "shopping"
  | "nightlife"
  | "other";

export type Expense = {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  exchange_rate_to_base?: number | null;
  amount_in_base?: number | null;
  expense_date: string | null;
  category: ExpenseCategory;
  paid_by: string | null;
  paid_by_participant_id: string | null;
  split_between: string[] | null;
  place: string | null;
  notes: string | null;
  linked_activity_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TripParticipant = {
  id: string;
  trip_id: string;
  display_name: string;
  username: string;
  phone?: string | null;
  joined_via?: "manual" | "whatsapp";
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseSettlement = {
  id: string;
  trip_id: string;
  from_participant_id: string;
  to_participant_id: string;
  amount: number;
  currency: string;
  exchange_rate_to_base?: number | null;
  amount_in_base?: number | null;
  settlement_date: string;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ResourceType =
  | "flight"
  | "hotel"
  | "train"
  | "car"
  | "insurance"
  | "ticket"
  | "document"
  | "link"
  | "other";

export type TripResource = {
  id: string;
  trip_id: string;
  title: string;
  resource_type: ResourceType;
  provider: string | null;
  reference_code: string | null;
  resource_date: string | null;
  url: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ActivityForm = {
  title: string;
  date: string;
  time: string;
  place: string;
  placeType: string;
  lat: number | null;
  lng: number | null;
};

export type AccommodationForm = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  checkInDate: string;
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  confirmationCode: string;
  notes: string;
};

export type ExpenseForm = {
  title: string;
  amount: string;
  currency: string;
  expenseDate: string;
  category: ExpenseCategory;
  paidByParticipantId: string;
  splitBetween: string[];
  place: string;
  notes: string;
};

export type ResourceForm = {
  title: string;
  resourceType: ResourceType;
  provider: string;
  referenceCode: string;
  resourceDate: string;
  url: string;
  notes: string;
};

export type ParticipantBalance = {
  id: string;
  name: string;
  paid: number;
  owed: number;
  net: number;
};

export type SuggestedSettlement = {
  fromParticipantId: string;
  toParticipantId: string;
  from: string;
  to: string;
  amount: number;
};

export type PaymentFilter = "all" | "pending" | "paid";