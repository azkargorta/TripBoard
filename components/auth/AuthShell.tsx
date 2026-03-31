import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-bold">
            TripBoard
          </Link>
          <h1 className="mt-6 text-3xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          {children}
        </div>

        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}