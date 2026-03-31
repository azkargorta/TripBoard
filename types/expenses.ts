export type ExpenseCategory =
  | 'general'
  | 'food'
  | 'transport'
  | 'hotel'
  | 'activities'
  | 'shopping'
  | 'nightlife'
  | 'other';

export type Expense = {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  expense_date: string;
  category: ExpenseCategory;
  paid_by: string | null;
  place: string | null;
  notes: string | null;
  linked_activity_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpensePayload = {
  title: string;
  amount: number;
  currency: string;
  expense_date: string;
  category: ExpenseCategory;
  paid_by?: string | null;
  place?: string | null;
  notes?: string | null;
  linked_activity_id?: string | null;
};

export type ExpenseSummary = {
  total: number;
  todayTotal: number;
  count: number;
  topCategory: string | null;
};