"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  /** Se mantiene por compatibilidad con usos previos. */
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  /** Se mantiene por compatibilidad (el logo ya incluye wordmark). */
  withWordmark?: boolean;
  href?: string;
  className?: string;
  /** Permite forzar altura/ancho del <img> desde la barra superior. */
  imageClassName?: string;
};

const sizePx = { sm: 96, md: 140, lg: 200 };

export default function TripBoardLogo({
  variant: _variant,
  size = "md",
  withWordmark: _withWordmark,
  href,
  className = "",
  imageClassName = "",
}: Props) {
  const px = sizePx[size];

  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/brand/icon.png"
        width={32}
        height={32}
        alt="Kaviro"
        className="h-8 w-8 shrink-0"
        priority
      />
      <span
        className={`select-none text-base font-black tracking-tight text-slate-950 ${imageClassName}`.trim()}
        style={{
          backgroundImage: "linear-gradient(135deg, #2563eb, #06b6d4)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Kaviro
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center rounded-lg outline-none ring-cyan-300/0 transition hover:opacity-90 focus-visible:ring-2">
        {mark}
      </Link>
    );
  }

  return mark;
}
