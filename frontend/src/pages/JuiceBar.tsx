import { ProductionBoard } from '../components/ProductionBoard';

export default function JuiceBar() {
  return (
    <ProductionBoard
      title="Suqueiros"
      subtitle="Sucos, refrigerantes e bebidas — central de produção"
      endpoint="/production/juice-bar"
      room="juice_bar"
      queryKey="juice-queue"
    />
  );
}
