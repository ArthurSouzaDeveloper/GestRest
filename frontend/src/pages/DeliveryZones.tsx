import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import api, { apiError } from '../lib/api';
import { brl } from '../lib/format';
import { Card, Modal, PageHeader, Spinner } from '../components/ui';
import type { DeliveryZone } from '../types';

export default function DeliveryZones() {
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

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Bairros e Taxas de Entrega"
        subtitle="Usados no site de pedidos online — o cliente escolhe o bairro e a taxa é calculada automaticamente"
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo Bairro</button>}
      />

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
