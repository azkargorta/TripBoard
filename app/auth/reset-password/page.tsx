import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Restablecer contraseña"
      subtitle="Elige una contraseña nueva para tu cuenta"
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}