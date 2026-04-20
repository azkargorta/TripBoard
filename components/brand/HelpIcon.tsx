import type { SVGProps } from "react";

export default function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient id="kaviroHelpGrad" x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.25" fill="url(#kaviroHelpGrad)" />
      <circle cx="12" cy="12" r="9.25" stroke="rgba(255,255,255,0.35)" />
      <path
        d="M10.15 9.65c.12-1.35 1.25-2.35 2.65-2.35 1.52 0 2.7 1.03 2.7 2.45 0 1-.5 1.62-1.45 2.15-.82.46-1.2.92-1.2 1.95v.05"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="16.8" r="1.25" fill="white" />
    </svg>
  );
}

