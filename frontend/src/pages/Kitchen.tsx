import { ProductionBoard } from '../components/ProductionBoard';
import { OnlineOrdersPanel } from '../components/OnlineOrdersPanel';

export default function Kitchen() {
  return (
    <div>
      <OnlineOrdersPanel />
      <ProductionBoard
        title="Cozinha"
        subtitle="Pastéis, mini pizzas e porções — do mais antigo ao mais recente"
        endpoint="/production/kitchen"
        room="kitchen"
        queryKey="kitchen-queue"
      />
    </div>
  );
}
