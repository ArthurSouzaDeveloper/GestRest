import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import type { Role } from './types';
import Login from './pages/Login';
import SuperAdmin from './pages/SuperAdmin';
import Dashboard from './pages/Dashboard';
import Tables from './pages/Tables';
import Kitchen from './pages/Kitchen';
import JuiceBar from './pages/JuiceBar';
import Cashier from './pages/Cashier';
import Products from './pages/Products';
import UsersPage from './pages/Users';
import Reports from './pages/Reports';
import Audit from './pages/Audit';

function Protected({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { user, loading, hasRole } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  // Superadmin não opera dentro de um restaurante — vai para o painel da plataforma.
  if (user.role === 'SUPERADMIN') return <Navigate to="/super" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/mesas" replace />;
  return <Layout>{children}</Layout>;
}

/** Envia cada perfil para a tela que ele realmente usa. */
function Home() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'SUPERADMIN':
      return <Navigate to="/super" replace />;
    case 'COOK':
      return <Navigate to="/cozinha" replace />;
    case 'JUICER':
      return <Navigate to="/suqueiros" replace />;
    case 'CASHIER':
      return <Navigate to="/caixa" replace />;
    case 'WAITER':
      return <Navigate to="/mesas" replace />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/r/:slug" element={<Login />} />
      <Route path="/super" element={<SuperAdmin />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/mesas" element={<Protected roles={['ADMIN', 'MANAGER', 'WAITER']}><Tables /></Protected>} />
      <Route path="/cozinha" element={<Protected roles={['ADMIN', 'MANAGER', 'COOK']}><Kitchen /></Protected>} />
      <Route path="/suqueiros" element={<Protected roles={['ADMIN', 'MANAGER', 'JUICER']}><JuiceBar /></Protected>} />
      <Route path="/caixa" element={<Protected roles={['ADMIN', 'MANAGER', 'CASHIER']}><Cashier /></Protected>} />
      <Route path="/produtos" element={<Protected roles={['ADMIN', 'MANAGER']}><Products /></Protected>} />
      <Route path="/relatorios" element={<Protected roles={['ADMIN', 'MANAGER']}><Reports /></Protected>} />
      <Route path="/usuarios" element={<Protected roles={['ADMIN', 'MANAGER']}><UsersPage /></Protected>} />
      <Route path="/auditoria" element={<Protected roles={['ADMIN', 'MANAGER']}><Audit /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
