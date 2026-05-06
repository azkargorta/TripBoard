import React from 'react';
import { 
  LayoutDashboard, 
  Map, 
  Wallet, 
  Files, 
  Settings, 
  UserPlus, 
  Plane,
  ChevronRight
} from 'lucide-react';

const DesktopTripSidebar = () => {
  return (
    <aside className="fixed left-0 top-0 w-64 h-screen bg-[var(--card)]/80 backdrop-blur-xl border-r border-[var(--border)] flex flex-col z-50">
      
      {/* 1. Header & Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <Plane className="text-white w-6 h-6 -rotate-12" />
        </div>
        <div>
          <h1 className="font-bold text-xl tracking-tight text-gray-900 leading-none">Kaviro</h1>
          <span className="text-[10px] uppercase tracking-widest text-[var(--secondary)] font-bold">Trips</span>
        </div>
      </div>

      {/* 2. Navegación Principal */}
      <nav className="flex-1 px-3 space-y-1">
        <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Menú Principal</p>
        
        <SidebarItem icon={<LayoutDashboard size={20} />} label="Resumen" active />
        <SidebarItem icon={<Map size={20} />} label="Itinerario" />
        <SidebarItem icon={<Wallet size={20} />} label="Gastos de Grupo" />
        <SidebarItem icon={<Files size={20} />} label="Documentos" />
      </nav>

      {/* 3. Sección de Grupo (Colaboración) */}
      <div className="px-3 mb-6">
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-3">Compañeros de ruta</p>
          <div className="flex -space-x-2 mb-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold overflow-hidden">
                <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="user" />
              </div>
            ))}
            <button className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors">
              <UserPlus size={14} />
            </button>
          </div>
          <button className="text-[11px] font-semibold text-[var(--primary)] flex items-center gap-1 hover:underline">
            Gestionar grupo <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* 4. Footer Sidebar */}
      <div className="p-4 border-t border-[var(--border)]">
        <SidebarItem icon={<Settings size={20} />} label="Configuración" />
      </div>
    </aside>
  );
};

/* Sub-componente para los items de la sidebar */
const SidebarItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => {
  return (
    <div className={`
      flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200
      ${active 
        ? 'bg-[var(--sidebar-active)] text-[var(--primary)] font-semibold' 
        : 'text-gray-500 hover:bg-[var(--sidebar-hover)] hover:text-gray-900'}
    `}>
      <span className={active ? 'text-[var(--primary)]' : 'text-gray-400'}>
        {icon}
      </span>
      <span className="text-sm">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />}
    </div>
  );
};

export default DesktopTripSidebar;