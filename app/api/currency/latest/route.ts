import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const base = (searchParams.get("base") || "EUR").toUpperCase();
    const target = (searchParams.get("symbols") || searchParams.get("target") || "USD").toUpperCase();

    const url = `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&quotes=${encodeURIComponent(target)}`;

    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudieron obtener tipos de cambio.", detail: text },
        { status: 400 }
      );
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Respuesta inválida del proveedor de divisas." },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      return NextResponse.json(
        { error: "No se encontró ningún tipo de cambio para la conversión solicitada." },
        { status: 404 }
      );
    }

    const first = parsed[0] as { base?: string; quote?: string; rate?: number; date?: string };
    if (typeof first.rate !== "number") {
      return NextResponse.json(
        { error: "La respuesta del proveedor no contiene una tasa válida." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      base,
      target,
      date: first.date || null,
      rates: {
        [target]: first.rate,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las divisas." },
      { status: 500 }
    );
  }
}
