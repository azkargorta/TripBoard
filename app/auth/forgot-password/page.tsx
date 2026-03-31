import AuthShell from "@/components/auth/AuthShell";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Te enviaremos un email para cambiar tu contraseña"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}