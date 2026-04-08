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
};

const sizePx = { sm: 96, md: 140, lg: 200 };

export default function TripBoardLogo({
  variant: _variant,
  size = "md",
  withWordmark: _withWordmark,
  href,
  className = "",
}: Props) {
  const px = sizePx[size];

  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.png"
        width={px}
        height={Math.round(px * 0.32)}
        alt="TripBoard"
        className="h-auto w-auto max-w-[180px]"
        priority
      />
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
