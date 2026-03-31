type ModulePermissionNoticeProps = {
  title?: string;
  description?: string;
};

export default function ModulePermissionNotice({
  title = "Solo lectura",
  description = "No tienes permisos para editar este módulo en este viaje.",
}: ModulePermissionNoticeProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <div className="font-semibold">{title}</div>
      <p className="mt-1">{description}</p>
    </div>
  );
}
