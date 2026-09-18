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
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 md:w-[440px] md:flex-none lg:w-[480px]">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start">
            <ChefHatBadge />
            {slug && restaurant ? (
              <>
                <h1 className="mt-4 text-xl font-semibold">{restaurant.name}</h1>
                <p className="text-sm text-gray-500">Acesso da equipe · GestRest</p>
              </>
            ) : slug && notFound ? (
              <>
                <h1 className="mt-4 text-xl font-semibold">Restaurante não encontrado</h1>
                <p className="text-sm text-gray-500">Verifique o link de acesso.</p>
              </>
            ) : (
              <>
                <h1 className="mt-4 text-xl font-semibold">GestRest</h1>
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

      {/* Painel ilustrado — só decorativo, escondido em telas pequenas pra não competir
          com o formulário no celular (onde a equipe também faz login). */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-[#16264C] to-[#0B1730] md:flex">
        <KitchenScene />
      </div>
    </div>
  );
}

function ChefHatBadge() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-lg shadow-brand/30">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2c-2.6 0-4.7 1.9-5 4.4C5.1 6.9 3.5 8.6 3.5 10.7c0 2.3 1.9 4.2 4.2 4.2h.3l.4 3.6c.1.9.8 1.5 1.7 1.5h3.8c.9 0 1.6-.6 1.7-1.5l.4-3.6h.3c2.3 0 4.2-1.9 4.2-4.2 0-2.1-1.6-3.8-3.5-4.3C16.7 3.9 14.6 2 12 2Z"
          fill="#fff"
        />
        <rect x="8.3" y="16.4" width="7.4" height="1.7" rx=".85" fill="rgb(var(--brand-rgb))" />
      </svg>
    </div>
  );
}

function KitchenScene() {
  return (
    <div className="login-scene relative flex flex-col items-center">
      <div
        className="absolute h-28 w-28 rounded-full bg-amber-400 blur-xl"
        style={{ top: 10, left: -80, animation: 'bokeh-drift 7s ease-in-out infinite .4s' }}
      />
      <div
        className="absolute h-20 w-20 rounded-full bg-brand-100 blur-xl"
        style={{ bottom: 40, right: -100, animation: 'bokeh-drift 7s ease-in-out infinite 1.8s' }}
      />

      <div className="relative h-64 w-64">
        {[0, 1.1, 2.2].map((delay, i) => (
          <span
            key={i}
            className="absolute bottom-[132px] block h-14 w-3 rounded-full bg-white/40 blur-[5px]"
            style={{ left: 96 + i * 28, animation: `steam-rise 4.2s ease-in-out infinite ${delay}s` }}
          />
        ))}

        <svg width="220" height="140" viewBox="0 0 240 150" className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <rect x="10" y="30" width="220" height="14" rx="7" fill="#F2F4FA" />
          <path d="M32 42 H208 L192 128 Q192 142 178 142 H62 Q48 142 48 128 Z" fill="#E4E9F5" />
          <rect x="0" y="34" width="28" height="10" rx="5" fill="#F2F4FA" />
          <rect x="212" y="34" width="28" height="10" rx="5" fill="#F2F4FA" />
          <circle cx="120" cy="24" r="7" fill="#F2F4FA" />
        </svg>

        <svg
          width="32"
          height="32"
          viewBox="0 0 40 40"
          className="absolute bottom-[26px] left-1/2 -translate-x-1/2"
          style={{ animation: 'flame-flicker 1.7s ease-in-out infinite', transformOrigin: 'bottom center' }}
        >
          <path d="M20 4C20 4 8 16 8 26a12 12 0 0 0 24 0C32 16 20 4 20 4Z" fill="url(#flame-gradient)" />
          <defs>
            <linearGradient id="flame-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFC876" />
              <stop offset="1" stopColor="#F0973A" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="mt-6 text-center">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-400">GestRest</p>
        <p className="max-w-[280px] text-lg font-semibold leading-snug text-gray-100">
          Da cozinha à mesa,
          <br />
          em tempo real.
        </p>
      </div>
    </div>
  );
}
