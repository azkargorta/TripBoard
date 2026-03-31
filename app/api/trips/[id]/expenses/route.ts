import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Expense, ExpensePayload } from '@/types/expenses';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeExpensePayload(body: Partial<ExpensePayload>) {
  return {
    title: String(body.title ?? '').trim(),
    amount: Number(body.amount ?? 0),
    currency: String(body.currency ?? 'EUR').trim().toUpperCase(),
    expense_date: String(body.expense_date ?? ''),
    category: String(body.category ?? 'general').trim(),
    paid_by: body.paid_by ? String(body.paid_by).trim() : null,
    place: body.place ? String(body.place).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    linked_activity_id: body.linked_activity_id ?? null,
  };
}

function validateExpensePayload(payload: ReturnType<typeof normalizeExpensePayload>) {
  if (!payload.title) {
    return 'El título es obligatorio';
  }

  if (!payload.expense_date) {
    return 'La fecha del gasto es obligatoria';
  }

  if (Number.isNaN(payload.amount) || payload.amount < 0) {
    return 'El importe debe ser un número válido';
  }

  if (!payload.currency || payload.currency.length < 3) {
    return 'La moneda no es válida';
  }

  return null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: tripId } = await context.params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', tripId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expenses: (data ?? []) as Expense[] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado al cargar gastos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: tripId } = await context.params;
    const supabase = await createClient();
    const body = (await request.json()) as Partial<ExpensePayload>;

    const payload = normalizeExpensePayload(body);
    const validationError = validateExpensePayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        trip_id: tripId,
        ...payload,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense: data as Expense }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado al crear gasto' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: tripId } = await context.params;
    const supabase = await createClient();

    const body = (await request.json()) as Partial<ExpensePayload> & { expenseId?: string };
    const expenseId = body.expenseId;

    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId es obligatorio' }, { status: 400 });
    }

    const payload = normalizeExpensePayload(body);
    const validationError = validateExpensePayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('id', expenseId)
      .eq('trip_id', tripId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense: data as Expense });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado al actualizar gasto' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: tripId } = await context.params;
    const supabase = await createClient();

    const body = (await request.json()) as { expenseId?: string };
    const expenseId = body.expenseId;

    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId es obligatorio' }, { status: 400 });
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('trip_id', tripId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado al borrar gasto' },
      { status: 500 }
    );
  }
}