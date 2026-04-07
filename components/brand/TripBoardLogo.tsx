"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  /** Texto claro sobre fondos oscuros (gradiente / rail). */
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
  href?: string;
  className?: string;
};

const sizePx = { sm: 28, md: 36, lg: 44 };

export default function TripBoardLogo({
  variant = "dark",
  size = "md",
  withWordmark = true,
  href,
  className = "",
}: Props) {
  const px = sizePx[size];
  const isLight = variant === "light";

  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/icons/icon.svg"
        width={px}
        height={px}
        alt=""
        className="rounded-lg shadow-sm ring-1 ring-black/5"
        priority
      />
      {withWordmark ? (
        <span
          className={`font-black tracking-tight ${size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg"}`}
        >
          <span className={isLight ? "text-white" : "text-slate-900"}>Trip</span>
          <span className={isLight ? "text-cyan-200" : "text-violet-600"}>Board</span>
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center rounded-lg outline-none ring-violet-300/0 transition hover:opacity-90 focus-visible:ring-2">
        {mark}
      </Link>
    );
  }

  return mark;
}
