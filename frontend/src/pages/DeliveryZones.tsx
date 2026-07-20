import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import type { DeliveryDistanceBand, DeliveryPricingMode, DeliveryPricingSettings, DeliveryZone } from '../types';

export default function DeliveryZones() {
  // A aba visitada é um estado local, separado do modo de fato ativo (settings.mode) —
  // precisa ser possível configurar origem/faixas do modo por distância SEM já estar
  // usando ele (senão vira um ovo-e-galinha: pra ativar precisa ter origem salva, mas a
  // origem só aparecia dentro do painel do modo já ativo). Ativar/desativar é uma ação
  // explícita dentro de cada painel, não uma consequência de navegar pra aba.
  const [tab, setTab] = useState<DeliveryPricingMode | null>(null);
  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['delivery-pricing-settings'],
    queryFn: async () => (await api.get<DeliveryPricingSettings>('/catalog/delivery-pricing-settings')).data,
  });

  if (loadingSettings || !settings) return <Spinner />;

  const activeTab = tab ?? settings.mode;

  return (
    <div>
      <PageHeader
        title="Entrega"
        subtitle="Como o sistema calcula a taxa de entrega no site de pedidos online"
      />

      <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
        <button
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            activeTab === 'ZONE' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('ZONE')}
        >
          Por bairro
        </button>
        <button
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            activeTab === 'DISTANCE_BANDS' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('DISTANCE_BANDS')}
        >
          Por distância (Google Maps)
        </button>
      </div>

      {activeTab === 'ZONE' ? <ZonesPanel active={settings.mode === 'ZONE'} /> : <DistanceBandsPanel settings={settings} />}
    </div>
  );
}

/** Selo indicando se o modo deste painel é o que está de fato em uso pelo site do cliente. */
function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active ? 'Modo ativo — em uso no site' : 'Não ativo'}
    </span>
  );
}

function ZonesPanel({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['delivery-zones', 'admin'],
    queryFn: async () => (await api.get<DeliveryZone[]>('/catalog/delivery-zones')).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['delivery-zones'] });
    qc.invalidateQueries({ queryKey: ['delivery-zones', 'admin'] });
  };

  const toggleActive = useMutation({
    mutationFn: async (z: DeliveryZone) => api.patch(`/catalog/delivery-zones/${z.id}`, { active: !z.active }),
    onSuccess: refresh,
    onError: (e) => alert(apiError(e)),
  });

  const activateMode = useMutation({
    mutationFn: async () => api.patch('/catalog/delivery-pricing-settings', { mode: 'ZONE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-pricing-settings'] }),
    onError: (e) => alert(apiError(e)),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ActiveBadge active={active} />
        {!active && (
          <button className="btn-secondary !py-1 !text-xs" disabled={activateMode.isPending} onClick={() => activateMode.mutate()}>
            Ativar modo por bairro
          </button>
        )}
      </div>

      <div className="mb-4 flex items-end justify-between">
        <p className="text-sm text-gray-500">O cliente escolhe o bairro no site e a taxa é aplicada automaticamente.</p>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Bairro</button>
      </div>

      {zones.length === 0 && (
        <div className="card mb-4 p-6 text-center text-sm text-gray-400">
          Nenhum bairro cadastrado ainda. Sem bairros, o cliente não consegue escolher entrega no site.
        </div>
      )}

      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-400 dark:border-gray-800">
              <tr>
                <th className="p-3">Bairro</th>
                <th className="p-3 text-right">Taxa</th>
                <th className="p-3 text-center">Ativo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-b border-gray-50 dark:border-gray-800">
                  <td className="p-3 font-medium">{z.name}</td>
                  <td className="p-3 text-right">{brl(z.fee)}</td>
                  <td className="p-3 text-center">
                    <button
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                        z.active
                          ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                          : 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700'
                      }`}
                      disabled={toggleActive.isPending}
                      title={z.active ? 'Desativar (some do site)' : 'Ativar (volta a aparecer no site)'}
                      onClick={() => toggleActive.mutate(z)}
                    >
                      {z.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <button className="btn-secondary !px-2 !py-1" onClick={() => setEditing(z)}><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(creating || editing) && (
        <ZoneForm
          zone={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { refresh(); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ZoneForm({
  zone,
  onClose,
  onSaved,
}: {
  zone: DeliveryZone | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: zone?.name ?? '',
    fee: zone?.fee ?? 0,
    active: zone?.active ?? true,
  });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, fee: Number(form.fee) };
      if (zone) return api.patch(`/catalog/delivery-zones/${zone.id}`, payload);
      return api.post('/catalog/delivery-zones', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={zone ? 'Editar Bairro' : 'Novo Bairro'}>
      <div className="space-y-3">
        <div>
          <label className="label">Nome do bairro</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Taxa de entrega (R$)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            value={form.fee}
            onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Ativo (aparece no site de pedidos)
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Endereço de origem ainda é lat/lng digitado à mão (dá pra achar num mapa e colar) — a
 * fase seguinte troca isso por um campo de busca com autocomplete assim que a rota
 * pública do Google Places existir, reaproveitado também na tela do cliente.
 */
function OriginForm({ settings }: { settings: DeliveryPricingSettings }) {
  const qc = useQueryClient();
  const [address, setAddress] = useState(settings.originAddress ?? '');
  const [lat, setLat] = useState(settings.originLat !== null ? String(settings.originLat) : '');
  const [lng, setLng] = useState(settings.originLng !== null ? String(settings.originLng) : '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () =>
      api.patch('/catalog/delivery-pricing-settings', {
        mode: settings.mode,
        originAddress: address.trim() || undefined,
        originLat: lat ? Number(lat) : undefined,
        originLng: lng ? Number(lng) : undefined,
      }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['delivery-pricing-settings'] });
    },
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Card className="mb-4">
      <h3 className="mb-3 text-sm font-semibold">Endereço de origem (de onde a distância é calculada)</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label">Endereço (exibição)</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Praça Luís de Boni, 57 - Americana, SP" />
        </div>
        <div>
          <label className="label">Latitude</label>
          <input className="input" type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-22.748188" />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input" type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-47.358627" />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar endereço</button>
      </div>
    </Card>
  );
}

function DistanceBandsPanel({ settings }: { settings: DeliveryPricingSettings }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DeliveryDistanceBand | null>(null);
  const [creating, setCreating] = useState(false);

  const active = settings.mode === 'DISTANCE_BANDS';
  const hasOrigin = settings.originLat !== null && settings.originLng !== null;

  const { data: bands = [], isLoading } = useQuery({
    queryKey: ['delivery-distance-bands', 'admin'],
    queryFn: async () => (await api.get<DeliveryDistanceBand[]>('/catalog/delivery-distance-bands')).data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['delivery-distance-bands'] });

  const toggleActive = useMutation({
    mutationFn: async (b: DeliveryDistanceBand) => api.patch(`/catalog/delivery-distance-bands/${b.id}`, { active: !b.active }),
    onSuccess: refresh,
    onError: (e) => alert(apiError(e)),
  });

  const activateMode = useMutation({
    mutationFn: async () => api.patch('/catalog/delivery-pricing-settings', { mode: 'DISTANCE_BANDS' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-pricing-settings'] }),
    onError: (e) => alert(apiError(e)),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ActiveBadge active={active} />
        {!active && (
          <button
            className="btn-secondary !py-1 !text-xs"
            disabled={activateMode.isPending || !hasOrigin}
            title={hasOrigin ? undefined : 'Salve o endereço de origem antes de ativar'}
            onClick={() => activateMode.mutate()}
          >
            Ativar modo por distância
          </button>
        )}
        {!hasOrigin && <span className="text-xs text-amber-600">Salve o endereço de origem abaixo antes de ativar.</span>}
      </div>

      <OriginForm settings={settings} />

      <div className="mb-4 flex items-end justify-between">
        <p className="text-sm text-gray-500">
          O sistema calcula a distância até o endereço do cliente e aplica a primeira faixa que cobrir. Endereço mais
          longe que a maior faixa cadastrada = fora da área de entrega.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setCreating(true)}><Plus size={16} /> Nova Faixa</button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : bands.length === 0 ? (
        <div className="card mb-4 p-6 text-center text-sm text-gray-400">
          Nenhuma faixa cadastrada ainda. Sem faixas, nenhum endereço consegue pedir entrega nesse modo.
        </div>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-gray-100 text-left text-xs uppercase text-gray-400 dark:border-gray-800">
                <tr>
                  <th className="p-3">Até (km)</th>
                  <th className="p-3 text-right">Taxa</th>
                  <th className="p-3 text-center">Ativa</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {[...bands]
                  .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm)
                  .map((b) => (
                    <tr key={b.id} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="p-3 font-medium">até {b.maxDistanceKm} km</td>
                      <td className="p-3 text-right">{brl(b.fee)}</td>
                      <td className="p-3 text-center">
                        <button
                          className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                            b.active
                              ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                              : 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700'
                          }`}
                          disabled={toggleActive.isPending}
                          title={b.active ? 'Desativar' : 'Ativar'}
                          onClick={() => toggleActive.mutate(b)}
                        >
                          {b.active ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button className="btn-secondary !px-2 !py-1" onClick={() => setEditing(b)}><Pencil size={14} /></button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(creating || editing) && (
        <BandForm
          band={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { refresh(); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function BandForm({
  band,
  onClose,
  onSaved,
}: {
  band: DeliveryDistanceBand | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    maxDistanceKm: band?.maxDistanceKm ?? 0,
    fee: band?.fee ?? 0,
    active: band?.active ?? true,
  });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, maxDistanceKm: Number(form.maxDistanceKm), fee: Number(form.fee) };
      if (band) return api.patch(`/catalog/delivery-distance-bands/${band.id}`, payload);
      return api.post('/catalog/delivery-distance-bands', payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={band ? 'Editar Faixa' : 'Nova Faixa'}>
      <div className="space-y-3">
        <div>
          <label className="label">Cobre até quantos km</label>
          <input
            className="input"
            type="number"
            step="0.1"
            min={0.1}
            value={form.maxDistanceKm}
            onChange={(e) => setForm({ ...form, maxDistanceKm: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Taxa de entrega (R$)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            value={form.fee}
            onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Ativa (conta pro cálculo do frete)
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
