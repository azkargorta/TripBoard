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

// 4/3 del tamaño anterior (aprox.)
const iconPx = { sm: 32, md: 37, lg: 45 };
const boxPx = { sm: 45, md: 53, lg: 64 };

export default function TripBoardLogo({
  variant = "dark",
  size = "md",
  withWordmark = true,
  href,
  className = "",
  imageClassName = "",
}: Props) {
  const px = iconPx[size];
  const box = boxPx[size];
  const isLight = variant === "light";

  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-2xl ${
          isLight ? "bg-white/10 ring-1 ring-white/15" : "bg-slate-900/5 ring-1 ring-slate-200"
        }`}
        style={{ width: box, height: box }}
        aria-hidden
      >
        <Image
          src="/brand/icon.png"
          width={px}
          height={px}
          alt=""
          className="h-full w-full object-contain scale-[1.18]"
          priority
        />
      </span>
      {withWordmark ? (
        <span
          className={`select-none font-black tracking-tight ${
            isLight ? "text-white" : "text-slate-950"
          } ${size === "sm" ? "text-[12px] tracking-[0.14em] uppercase" : "text-base"} ${imageClassName}`.trim()}
          style={
            isLight
              ? undefined
              : {
                  backgroundImage: "linear-gradient(135deg, #2563eb, #06b6d4)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }
          }
        >
          Kaviro
        </span>
      ) : null}
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
