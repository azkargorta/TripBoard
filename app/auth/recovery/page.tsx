import AuthShell from "@/components/auth/AuthShell";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";

export default function AuthRecoveryPage() {
  return (
    <AuthShell
      title="Recuperar acceso"
      subtitle="Te estamos llevando a la pantalla para elegir una nueva contraseña."
    >
      <RecoveryRedirect />
    </AuthShell>
  );
}
