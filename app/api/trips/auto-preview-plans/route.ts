import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { mergeTripCreationIntentLLM } from "@/lib/trip-ai/parseTripCreationIntent";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { generateExecutableItineraryFromIntent } from "@/lib/trip-ai/generateItineraryFromIntent";
import type { TripAiUsage } from "@/lib/trip-ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

async function trackIfCountable(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  monthKey: string;
  usage: TripAiUsage;
}) {
  if (typeof params.usage.inputTokens === "number" && typeof params.usage.outputTokens === "number") {
    await trackAiUsage({
      supabase: params.supabase,
      userId: params.userId,
      provider: "gemini",
      monthKey: params.monthKey,
      usage: params.usage,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
    const draftIntent = body?.draftIntent as TripCreationIntent | undefined;
    if (!draftIntent) {
      return NextResponse.json({ error: "Falta draftIntent." }, { status: 400 });
    }

    const monthKey = monthKeyUtc();
    let supabase: Awaited<ReturnType<typeof createClient>>;
    let userId: string;
    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status =
        typeof err?.httpStatus === "number" ? err.httpStatus : err?.code === "AI_BUDGET_EXCEEDED" ? 402 : 401;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No autenticado.", code: err?.code || null, budget: err?.budget || null },
        { status }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    const profilePremium = Boolean((profileRow as { is_premium?: boolean } | null)?.is_premium);
    if (!profilePremium) {
      return NextResponse.json(
        {
          error:
            "Necesitas cuenta Premium para previsualizar planes automáticamente. Puedes crear el viaje a mano con el formulario.",
          code: "PREMIUM_REQUIRED",
        },
        { status: 402 }
      );
    }

    let intent: TripCreationIntent = draftIntent;
    if (followUp) {
      const merged = await mergeTripCreationIntentLLM(draftIntent, followUp, { provider });
      intent = merged.intent;
      await trackIfCountable({ supabase, userId, monthKey, usage: merged.usage });
    }

    const miss = getTripCreationFollowUp(intent);
    if (miss) {
      return NextResponse.json({
        status: "needs_clarification",
        question: miss.question,
        code: miss.code,
        draftIntent: intent,
      });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    // Si las fechas han sido inferidas por defecto, pedimos fechas explícitas.
    if (resolved.datesInferred) {
      const nextIntent: TripCreationIntent = {
        ...resolved.intent,
        startDate: null,
        endDate: null,
      };
      return NextResponse.json({
        status: "needs_clarification",
        question: "¿Qué fechas exactas tienes para el viaje? (inicio y fin). Si aún no lo sabes, dime un mes aproximado.",
        code: "duration_or_dates",
        draftIntent: nextIntent,
      });
    }

    const { itinerary, usage } = await generateExecutableItineraryFromIntent(resolved, { provider });
    await trackIfCountable({ supabase, userId, monthKey, usage });

    return NextResponse.json({
      status: "ok",
      draftIntent: resolved.intent,
      resolved: {
        destination: resolved.destination,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        durationDays: resolved.durationDays,
      },
      itinerary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo previsualizar los planes." },
      { status: 500 }
    );
  }
}

