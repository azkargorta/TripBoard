import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Accede a tu cuenta de Kaviro"
    >
      <LoginForm />
    </AuthShell>
  );
}