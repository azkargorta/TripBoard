import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const amount = Number(searchParams.get("amount") || "0");
    const from = (searchParams.get("from") || "EUR").toUpperCase();
    const to = (searchParams.get("to") || "USD").toUpperCase();

    if (!from || !to) {
      return NextResponse.json(
        { error: "Las monedas from y to son obligatorias." },
        { status: 400 }
      );
    }

    if (Number.isNaN(amount) || amount < 0) {
      return NextResponse.json(
        { error: "La cantidad no es válida." },
        { status: 400 }
      );
    }

    if (from === to) {
      return NextResponse.json({
        amount,
        from,
        to,
        rate: 1,
        convertedAmount: amount,
        date: new Date().toISOString().slice(0, 10),
      });
    }

    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        next: {
          revalidate: 3600,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo obtener el tipo de cambio." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rate = Number(data?.rates?.[to]);

    if (!rate || Number.isNaN(rate)) {
      return NextResponse.json(
        { error: "No se encontró el tipo de cambio para esas monedas." },
        { status: 400 }
      );
    }

    const convertedAmount = Number((amount * rate).toFixed(2));

    return NextResponse.json({
      amount,
      from,
      to,
      rate,
      convertedAmount,
      date: data?.date || new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error inesperado al convertir moneda.",
      },
      { status: 500 }
    );
  }
}