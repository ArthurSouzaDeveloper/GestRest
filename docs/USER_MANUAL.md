# Manual do Usuário — GestRest

O sistema foi desenhado para ser aprendido em menos de 15 minutos. Cada funcionário faz login e é levado direto à sua tela de trabalho.

## Login

Acesse o sistema, informe **e-mail** e **senha**. Você será direcionado automaticamente para a tela do seu perfil.

---

## 👤 Garçom — Mesas e Pedidos

1. **Abrir mesa**: na tela **Mesas**, toque em uma mesa **cinza (Livre)**. Informe (opcionalmente) o nome do cliente, a quantidade de pessoas e observações. Toque em **Abrir Mesa**.
2. **Lançar pedido**: toque na mesa (agora **azul/Ocupada**). No painel, escolha a categoria, toque nos produtos para adicioná-los. Use **+ / –** para a quantidade e **Obs** para adicionais e observações (ex.: *sem açúcar*, *bem passado*).
3. **Confirmar**: toque em **Confirmar Pedido**. O sistema envia automaticamente as bebidas para os Suqueiros e as comidas para a Cozinha.
4. Você pode adicionar novos itens à mesma mesa quantas vezes quiser durante o atendimento.

> Todo o processo de lançar um pedido leva menos de 30 segundos.

---

## 🥤 Suqueiro / 🍳 Cozinheiro — Produção

- A tela mostra **apenas os itens do seu setor**, do mais antigo ao mais recente.
- Cada card traz: **mesa**, cliente, produto, quantidade, **observações**, adicionais e **tempo de espera**.
- Itens que passaram do tempo médio de preparo ficam **destacados em vermelho**.
- Toque em **Preparando** ao iniciar; toque em **Concluído** ao terminar — o item **desaparece** da fila.
- A tela atualiza sozinha quando novos pedidos chegam (sem recarregar).

---

## 💳 Caixa — Pagamento

- A coluna da esquerda lista os pedidos **Prontos para Pagamento** (só aparecem quando **todos** os itens, de todos os setores, estão concluídos).
- Selecione um pedido para ver os itens, valores e o total à direita.
- Você pode: **cancelar item** (lixeira), **alterar quantidade**, **aplicar desconto** — os totais recalculam na hora.
- **Receber pagamento**: adicione uma ou mais formas (PIX, Dinheiro, Crédito, Débito, Vale). Para dinheiro, informe o valor recebido e o **troco** é calculado automaticamente. É possível dividir (pagamento misto).
- Toque em **Finalizar Pagamento**. A mesa volta para **Livre** automaticamente.

---

## 📊 Gerente / Administrador

- **Dashboard**: mesas por status, itens em espera/produção, faturamento diário/semanal/mensal, produtos mais vendidos, garçons com mais vendas e tempo médio de produção.
- **Produtos**: cadastrar e editar itens do cardápio, preços, tempo de preparo e disponibilidade.
- **Usuários**: cadastrar a equipe e definir o perfil de acesso.
- **Relatórios**: consolidado de vendas e exportação CSV.
- **Auditoria**: histórico de todas as ações (quem fez, o quê, quando e de qual IP).

---

## Cores de status

| Cor | Significado |
|-----|-------------|
| Cinza | Livre / Aguardando |
| Azul | Mesa ocupada |
| Amarelo | Em produção / Preparando |
| Verde | Concluído / Pronto para pagamento |
| Vermelho | Cancelado / Item atrasado |
