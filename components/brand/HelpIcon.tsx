import type { SVGProps } from "react";

export function HelpIconQuestion(props: SVGProps<SVGSVGElement>) {
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

export function HelpIconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id="kaviroHelpInfoGrad" x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22c55e" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.25" fill="url(#kaviroHelpInfoGrad)" />
      <circle cx="12" cy="12" r="9.25" stroke="rgba(255,255,255,0.35)" />
      <circle cx="12" cy="8.35" r="1.3" fill="white" />
      <path d="M12 11.1v6.1" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function HelpIconLifebuoy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id="kaviroHelpLifeGrad" x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fb7185" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.25" fill="url(#kaviroHelpLifeGrad)" />
      <circle cx="12" cy="12" r="9.25" stroke="rgba(255,255,255,0.35)" />
      <circle cx="12" cy="12" r="4.2" stroke="white" strokeWidth="2.2" />
      <path d="M12 2.9v3.1M12 18v3.1M2.9 12H6M18 12h3.1" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function HelpIconSpark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id="kaviroHelpSparkGrad" x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.25" fill="url(#kaviroHelpSparkGrad)" />
      <circle cx="12" cy="12" r="9.25" stroke="rgba(255,255,255,0.35)" />
      <path
        d="M12 7.1l1 2.55 2.65 1-2.65 1-1 2.55-1-2.55-2.65-1 2.65-1 1-2.55Z"
        fill="white"
        fillOpacity="0.95"
      />
      <path d="M7.15 14.6l.55 1.4 1.45.55-1.45.55-.55 1.4-.55-1.4-1.45-.55 1.45-.55.55-1.4Z" fill="white" fillOpacity="0.85" />
    </svg>
  );
}

export default HelpIconQuestion;

