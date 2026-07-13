import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { apiError } from '../lib/api';

interface PublicRestaurant {
  name: string;
  slug: string;
  active: boolean;
}

export default function Login() {
  const { slug } = useParams();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Se já estiver logado, manda para a tela certa.
  useEffect(() => {
    if (user) navigate(user.role === 'SUPERADMIN' ? '/super' : '/', { replace: true });
  }, [user, navigate]);

  // Login "com marca": busca o nome do restaurante pelo slug do link.
  useEffect(() => {
    if (!slug) return;
    api
      .get(`/public/restaurants/${slug}`)
      .then(({ data }) => setRestaurant(data))
      .catch(() => setNotFound(true));
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-950">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
            GR
          </div>
          {slug && restaurant ? (
            <>
              <h1 className="text-xl font-semibold">{restaurant.name}</h1>
              <p className="text-sm text-gray-500">Acesso da equipe · GestRest</p>
            </>
          ) : slug && notFound ? (
            <>
              <h1 className="text-xl font-semibold">Restaurante não encontrado</h1>
              <p className="text-sm text-gray-500">Verifique o link de acesso.</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">GestRest</h1>
              <p className="text-sm text-gray-500">Sistema de Gestão de Restaurante</p>
            </>
          )}
        </div>

        {!(slug && notFound) && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}

        {restaurant && restaurant.active === false && (
          <p className="mt-4 text-center text-sm text-red-600">Este restaurante está inativo.</p>
        )}
      </div>
    </div>
  );
}
