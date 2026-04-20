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

/** Logo horizontal oficial (marca + wordmark). */
const KAVIRO_LOCKUP_SRC = "/brand/kaviro-logo-full.png";

const lockupHeightClass = {
  sm: "h-9 max-h-9 sm:h-10 sm:max-h-10",
  md: "h-10 max-h-10 sm:h-11 sm:max-h-11",
  lg: "h-12 max-h-12 sm:h-13 sm:max-h-13",
} as const;

// Solo marca (globo + pin), sin wordmark en imagen
const iconPx = { sm: 36, md: 42, lg: 52 };
const boxPx = { sm: 52, md: 62, lg: 76 };

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

  const lockupImgClass = [
    "w-auto object-contain object-left",
    lockupHeightClass[size],
    "max-w-[min(420px,92vw)]",
    // El lockup es “sin fondo”: no invertimos; añadimos sombra suave en fondos oscuros.
    variant === "light"
      ? "opacity-[0.98] drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] drop-shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
      : "opacity-[0.98] drop-shadow-[0_10px_18px_rgba(2,6,23,0.10)]",
    imageClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const mark = withWordmark ? (
    <span className={`inline-flex items-center ${className}`.trim()}>
      <Image src={KAVIRO_LOCKUP_SRC} alt="Kaviro" width={260} height={70} className={lockupImgClass} priority />
    </span>
  ) : (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-full ${
          isLight ? "bg-white ring-1 ring-white/30" : "bg-white ring-1 ring-slate-200"
        }`}
        style={{ width: box, height: box }}
        aria-hidden
      >
        <Image
          src="/brand/kaviro-globe-pin.png"
          width={px}
          height={px}
          alt=""
          className={`h-full w-full object-contain ${imageClassName}`.trim()}
          priority
        />
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
