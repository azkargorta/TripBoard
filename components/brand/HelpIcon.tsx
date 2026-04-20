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
        <linearGradient id="kaviroHelpGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="url(#kaviroHelpGrad)" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="rgba(255,255,255,0.35)" />
      <path
        d="M12 15.1c-.6 0-1.1.5-1.1 1.1s.5 1.1 1.1 1.1 1.1-.5 1.1-1.1-.5-1.1-1.1-1.1Z"
        fill="white"
        fillOpacity="0.95"
      />
      <path
        d="M9.3 9.6c.1-1.7 1.5-3 3.3-3 1.9 0 3.4 1.3 3.4 3.1 0 1.2-.6 2.1-1.8 2.8-.9.5-1.2.9-1.2 1.8v.2"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

