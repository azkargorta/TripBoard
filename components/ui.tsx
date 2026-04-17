import Link from "next/link";
import React from "react";

export function Button({
  children,
  href,
  variant = "primary"
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "success";
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    padding: "12px 18px",
    borderRadius: "14px",
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap"
  };

  const styles =
    variant === "primary"
      ? { background: "var(--primary)", color: "#fff", boxShadow: "0 10px 22px rgba(109, 40, 217, 0.22)" }
      : variant === "secondary"
      ? { background: "#fff", color: "var(--text)", border: "1px solid var(--border)" }
      : variant === "success"
      ? { background: "#fff", color: "var(--green)", border: "1px solid #bbf7d0" }
      : { background: "transparent", color: "var(--primary-dark)" };

  if (href) return <Link href={href} style={{ ...base, ...styles }}>{children}</Link>;
  return <button style={{ ...base, ...styles }}>{children}</button>;
}

export function Card({
  children,
  padding = 20,
  style
}: {
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={{ padding, ...style }}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "purple"
}: {
  children: React.ReactNode;
  tone?: "purple" | "green" | "red" | "amber";
}) {
  const tones = {
    purple: { background: "var(--primary-soft)", color: "var(--primary-dark)" },
    green: { background: "var(--green-bg)", color: "var(--green)" },
    red: { background: "var(--red-bg)", color: "var(--red)" },
    amber: { background: "var(--amber-bg)", color: "var(--amber)" }
  };
  return (
    <span style={{
      display: "inline-flex",
      padding: "8px 12px",
      borderRadius: 999,
      fontWeight: 800,
      ...tones[tone]
    }}>
      {children}
    </span>
  );
}

export function PageIntro({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 52, lineHeight: 1.02, margin: "0 0 12px" }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, fontSize: 20, color: "var(--muted)", maxWidth: 760 }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function TripWorkspaceHeader({
  title,
  destination,
  dates,
  participants,
  days,
  backHref = "/dashboard"
}: {
  title: string;
  destination: string;
  dates: string;
  participants: string;
  days: string;
  backHref?: string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Link href={backHref} style={{ display: "inline-flex", marginBottom: 18, color: "var(--muted)", fontWeight: 700 }}>
        ← Mis viajes
      </Link>

      <div className="trip-header">
        <div>
          <h1 style={{ fontSize: 50, lineHeight: 1.02, margin: "0 0 12px", textTransform: "lowercase" }}>{title}</h1>
          <div className="trip-meta">
            <span>📍 {destination}</span>
            <span>📅 {dates}</span>
            <span>👥 {participants}</span>
          </div>
        </div>

        <div className="trip-actions">
          <Badge>{days}</Badge>
          <Button variant="secondary">Editar viaje</Button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceTabs({
  tripId,
  active
}: {
  tripId: string;
  active: "resumen" | "plan" | "gastos" | "lugares" | "recursos" | "personas" | "ia";
}) {
  const items = [
    ["resumen", "Resumen"],
    ["plan", "Plan"],
    ["gastos", "Gastos"],
    ["lugares", "Lugares"],
    ["recursos", "Recursos"],
    ["personas", "Personas"],
    ["ia", "Asistente personal"]
  ] as const;

  return (
    <div className="tabbar">
      {items.map(([key, label]) => (
        <Link
          key={key}
          href={`/trip/${tripId}?section=${key}`}
          style={{
            padding: "13px 18px",
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: active === key ? "#fff" : "rgba(255,255,255,0.55)",
            color: active === key ? "var(--primary-dark)" : "var(--muted)",
            fontWeight: 800,
            boxShadow: active === key ? "var(--shadow)" : "none"
          }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export function KPI({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <Card padding={18}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16, background: "var(--primary-soft)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{value}</div>
          <div className="muted" style={{ marginTop: 4 }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
