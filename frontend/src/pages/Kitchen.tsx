import { ProductionBoard } from '../components/ProductionBoard';
import { OnlineOrdersPanel } from '../components/OnlineOrdersPanel';

export default function Kitchen() {
  return (
    <div>
      <OnlineOrdersPanel />
      <ProductionBoard
        title="Cozinha"
        endpoint="/production/kitchen"
        room="kitchen"
        queryKey="kitchen-queue"
      />
    </div>
  );
}
