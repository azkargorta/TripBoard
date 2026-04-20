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
        <linearGradient id="kaviroHelpGrad" x1="2.5" y1="2.5" x2="21.5" y2="21.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22c55e" />
          <stop offset="0.5" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="6" fill="url(#kaviroHelpGrad)" />
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="6" stroke="rgba(255,255,255,0.38)" />
      <path
        d="M7.5 15.9c-.3-1.1.5-2.2 1.6-2.2h1.2"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12 15.1c-.6 0-1.1.5-1.1 1.1s.5 1.1 1.1 1.1 1.1-.5 1.1-1.1-.5-1.1-1.1-1.1Z"
        fill="white"
        fillOpacity="0.95"
      />
      <path
        d="M9.2 9.6c.1-1.8 1.6-3.2 3.6-3.2 2 0 3.6 1.4 3.6 3.3 0 1.3-.7 2.3-1.9 3-.9.5-1.3 1-1.3 1.9v.1"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="2.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

