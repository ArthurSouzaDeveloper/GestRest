import { ProductionBoard } from '../components/ProductionBoard';

export default function Kitchen() {
  return (
    <ProductionBoard
      title="Cozinha"
      subtitle="Pastéis, mini pizzas e porções — do mais antigo ao mais recente"
      endpoint="/production/kitchen"
      room="kitchen"
      queryKey="kitchen-queue"
    />
  );
}
