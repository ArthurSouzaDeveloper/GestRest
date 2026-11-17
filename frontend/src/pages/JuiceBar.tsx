import { ProductionBoard } from '../components/ProductionBoard';

export default function JuiceBar() {
  return (
    <ProductionBoard
      title="Suqueiros"
      endpoint="/production/juice-bar"
      room="juice_bar"
      queryKey="juice-queue"
    />
  );
}
