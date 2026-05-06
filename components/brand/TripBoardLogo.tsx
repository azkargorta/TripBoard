"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  /** Se mantiene por compatibilidad con usos previos. */
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  /** Si `true`, muestra el lockup (logo + nombre). Si `false`, solo icono. */
  withWordmark?: boolean;
  href?: string;
  className?: string;
  /** Permite forzar altura/ancho del <img> desde la barra superior. */
  imageClassName?: string;
};

const KAVIRO_LOCKUP_FULLCOLOR_SRC = "/brand/kaviro-lockup-fullcolor.png";
const KAVIRO_LOCKUP_WHITE_SRC = "/brand/kaviro-lockup-white.png";

const lockupHeightClass = {
  // El lockup es raster (PNG): no lo escalamos más de la cuenta para evitar pixelado.
  sm: "h-7 max-h-7 sm:h-8 sm:max-h-8",
  md: "h-8 max-h-8 sm:h-9 sm:max-h-9",
  lg: "h-9 max-h-9 sm:h-10 sm:max-h-10",
} as const;

// Marca (globo + pin)
const iconPx = { sm: 36, md: 42, lg: 52 };
const boxPx = { sm: 52, md: 62, lg: 76 };

export default function TripBoardLogo({
  variant = "dark",
  size = "md",
  withWordmark = false,
  href,
  className = "",
  imageClassName = "",
}: Props) {
  const px = iconPx[size];
  const box = boxPx[size];
  const isLight = variant === "light";

  const lockupSrc = isLight ? KAVIRO_LOCKUP_WHITE_SRC : KAVIRO_LOCKUP_FULLCOLOR_SRC;
  const lockupImgClass = [
    "w-auto object-contain object-left",
    lockupHeightClass[size],
    "max-w-[min(840px,96vw)]",
    // Integración natural: sombra suave para separar del fondo sin borde.
    isLight
      ? "opacity-[0.98] drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] drop-shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
      : "opacity-[0.98] drop-shadow-[0_10px_18px_rgba(2,6,23,0.10)]",
    imageClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const mark = withWordmark ? (
    <span className={`inline-flex items-center ${className}`.trim()}>
      <Image src={lockupSrc} alt="Kaviro" width={1800} height={608} className={lockupImgClass} priority />
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
