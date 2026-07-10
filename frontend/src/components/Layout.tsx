import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Grid3x3,
  ChefHat,
  CupSoda,
  CreditCard,
  Package,
  BarChart3,
  Users,
  ShieldCheck,
  LogOut,
  Menu,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { to: '/mesas', label: 'Mesas', icon: <Grid3x3 size={18} />, roles: ['ADMIN', 'MANAGER', 'WAITER'] },
  { to: '/cozinha', label: 'Cozinha', icon: <ChefHat size={18} />, roles: ['ADMIN', 'MANAGER', 'COOK'] },
  { to: '/suqueiros', label: 'Suqueiros', icon: <CupSoda size={18} />, roles: ['ADMIN', 'MANAGER', 'JUICER'] },
  { to: '/caixa', label: 'Caixa', icon: <CreditCard size={18} />, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { to: '/produtos', label: 'Produtos', icon: <Package size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { to: '/usuarios', label: 'Usuários', icon: <Users size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { to: '/auditoria', label: 'Auditoria', icon: <ShieldCheck size={18} />, roles: ['ADMIN', 'MANAGER'] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => hasRole(...n.roles));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-60 transform border-r border-gray-200 bg-white transition-transform dark:border-gray-800 dark:bg-gray-900 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5 dark:border-gray-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
            GR
          </div>
          <span className="text-lg font-semibold">GestRest</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
          <button className="btn-secondary lg:hidden" onClick={() => setOpen((v) => !v)}>
            <Menu size={18} />
          </button>
          <div className="hidden text-sm text-gray-500 lg:block">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-gray-500">{user?.role}</div>
            </div>
            <button className="btn-secondary" onClick={handleLogout} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
