import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Nueva contraseña"
      subtitle="Introduce tu nueva contraseña"
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}