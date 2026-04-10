import AuthShell from "@/components/auth/AuthShell";
import ConfirmAccountView from "@/components/auth/ConfirmAccountView";

export default function ConfirmedPage() {
  return (
    <AuthShell title="Validando tu cuenta" subtitle="Estamos comprobando el enlace de confirmación.">
      <ConfirmAccountView />
    </AuthShell>
  );
}

