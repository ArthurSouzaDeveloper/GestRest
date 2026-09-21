import { OnlineOrdersPanel } from '../components/OnlineOrdersPanel';

/**
 * Fila compartilhada de entregas: qualquer motoboy logado vê os mesmos pedidos de
 * entrega e pode marcar qualquer um como entregue (sem atribuição prévia). "Marcar
 * Entregue" já fecha o pagamento também — pagamento na entrega é o próprio ato de
 * entregar (ver paymentService.deliverOnline).
 */
export default function Motoboy() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Entregas</h1>
      <OnlineOrdersPanel
        orderTypes={['DELIVERY']}
        canAccept={false}
        title="Prontos para sair / a caminho"
        emptyMessage="Nenhuma entrega pendente no momento."
      />
    </div>
  );
}
