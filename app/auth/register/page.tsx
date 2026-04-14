import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Empieza a organizar viajes y gastos en Kaviro"
    >
      <RegisterForm />
    </AuthShell>
  );
}