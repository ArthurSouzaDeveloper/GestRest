import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { Card, PageHeader, Spinner } from '../components/ui';
import { DEFAULT_BRAND_COLOR } from '../lib/publicBrand';
import type { BrandingSettings } from '../types';

/**
 * Cor e logo do site público de pedidos — antes fixas no código (só fazia sentido
 * enquanto o Rei do Suco era o único restaurante na plataforma), agora configuráveis por
 * tenant. Ver branding.service.ts (backend) e lib/publicBrand.ts (como o site público lê
 * isso e deriva os tons claros/escuros a partir de uma cor só).
 */
export default function Branding() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => (await api.get<BrandingSettings>('/catalog/branding')).data,
  });

  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [colorError, setColorError] = useState('');
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Só sincroniza com o servidor quando o dado muda de fora (primeira carga) — não a
  // cada render, senão digitar no campo de cor seria sobrescrito pelo valor em cache.
  useEffect(() => {
    if (settings?.brandColor) setColor(settings.brandColor);
  }, [settings?.brandColor]);

  const saveColor = useMutation({
    mutationFn: async () => api.patch('/catalog/branding', { brandColor: color }),
    onSuccess: () => {
      setColorError('');
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
    onError: (e) => setColorError(apiError(e)),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return api.post('/catalog/branding/logo', form);
    },
    onSuccess: () => {
      setLogoError('');
      qc.invalidateQueries({ queryKey: ['branding'] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (e) => setLogoError(apiError(e)),
  });

  if (isLoading || !settings) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Identidade Visual"
        subtitle="Cor e logo usadas no site público de pedidos — cada restaurante tem a própria"
      />

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold">Cor da marca</h3>
        <p className="mb-3 text-sm text-gray-500">
          Só uma cor — as tonalidades mais claras (fundo de painel) e mais escuras (gradiente de botão) usadas no
          site de pedidos são calculadas automaticamente a partir dela.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-800"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <input
            className="input w-32 font-mono uppercase"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#9D1CC4"
            maxLength={7}
          />
          <button className="btn-primary" disabled={saveColor.isPending} onClick={() => saveColor.mutate()}>
            Salvar cor
          </button>
        </div>
        {colorError && <p className="mt-2 text-sm text-red-600">{colorError}</p>}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Logo</h3>
        <p className="mb-3 text-sm text-gray-500">
          Aparece "suspensa" no topo da Capa do site de pedidos. Sem logo enviada, o site mostra as iniciais do
          nome do restaurante num distintivo na cor da marca. PNG, JPEG ou WebP, até 3 MB.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo atual" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-extrabold text-white"
              style={{ backgroundColor: color }}
            >
              ?
            </div>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo.mutate(file);
              }}
            />
            <button className="btn-secondary" disabled={uploadLogo.isPending} onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} /> {uploadLogo.isPending ? 'Enviando...' : 'Enviar logo'}
            </button>
            {logoError && <p className="mt-2 text-sm text-red-600">{logoError}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
