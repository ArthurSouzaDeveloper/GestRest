# Deploy no Hetzner (acesso por IP)

Guia para publicar o GestRest num servidor Hetzner Cloud, acessível pelo **IP do servidor via HTTP**. Sem domínio e sem HTTPS (dá para adicionar depois — veja o final).

> Pré-requisitos: um servidor Hetzner já criado (Ubuntu 22.04/24.04) e o IP + acesso SSH como `root`.

## 1. Conectar no servidor

No seu computador, abra o terminal e conecte (troque pelo IP real):

```bash
ssh root@SEU_IP
```

## 2. Instalar o Git e clonar o projeto

```bash
apt update && apt install -y git
git clone https://github.com/ArthurSouzaDeveloper/GestRest.git
cd GestRest
```

> Se o repositório for privado, o Git vai pedir usuário e um **token de acesso** do GitHub (em vez de senha).

## 3. Configurar os segredos (.env)

```bash
cp .env.production.example .env
nano .env
```

Preencha:

| Variável | O que colocar |
|----------|---------------|
| `POSTGRES_PASSWORD` | Uma senha forte para o banco (invente uma) |
| `JWT_ACCESS_SECRET` | Rode `openssl rand -hex 32` e cole o resultado |
| `JWT_REFRESH_SECRET` | Rode `openssl rand -hex 32` de novo (valor diferente) |
| `HTTP_PORT` | `80` (padrão). Use outra porta, ex. `8081`, se o servidor já tiver outro sistema na 80 |
| `PUBLIC_URL` | `http://SEU_IP` — **inclua a porta se não for 80**, ex.: `http://SEU_IP:8081` |

Gere os segredos facilmente:

```bash
openssl rand -hex 32   # copie a saída para JWT_ACCESS_SECRET
openssl rand -hex 32   # copie a saída para JWT_REFRESH_SECRET
```

Salve no `nano` com `Ctrl+O`, `Enter`, depois `Ctrl+X`.

## 4. Subir tudo (um comando)

```bash
bash deploy/hetzner-setup.sh
```

O script instala o Docker (se faltar), libera a porta 80, sobe o banco + backend + frontend, aplica as migrações e pede o e-mail/senha do **seu** super admin (não vem nenhuma conta com senha padrão). Ao final mostra o endereço de acesso.

## 5. Liberar a porta no firewall do Hetzner

Se você criou um **Firewall** no painel do Hetzner Cloud, adicione uma regra de entrada:

- Painel Hetzner → seu servidor → *Firewalls* → *Rules* → **Inbound**
- Adicione: `TCP` porta `80` (ou a que você definiu em `HTTP_PORT`) de origem `Any IPv4 / Any IPv6`

(Sem firewall do Hetzner, o script já cuida do `ufw` interno.)

## 6. Acessar

Abra no navegador:

```
http://SEU_IP
```

Acesse `http://SEU_IP/super` com o e-mail e a senha que você digitou no passo 4.

No painel `/super`, clique em **Novo Restaurante** e cadastre cada casa com o **e-mail e senha próprios do admin dela** — esse admin entra pelo link `/r/<slug>` e monta o cardápio.

> Não existe mais restaurante nem usuário de demonstração criado automaticamente — cada conta em produção é criada explicitamente com e-mail/senha próprios, seja pelo `hetzner-setup.sh` (super admin) seja pelo painel `/super` (admin de cada restaurante).

### Redefinir a senha do super admin

Os parâmetros são **nomeados** e podem vir em qualquer ordem (não há como confundir
qual valor é o quê):

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec backend \
  node dist/scripts/create-superadmin.js --email=seu@email.com --senha=SuaSenhaForte123 --nome="Seu Nome"
```

Rode o mesmo comando de novo a qualquer momento para **redefinir a senha** do superadmin (é idempotente — não cria duplicado).

---

## Atualizar um servidor já rodando para a versão multi-restaurante

A versão multi-restaurante muda a estrutura do banco. Se o seu banco em produção
ainda só tinha dados de demonstração (do fluxo antigo, anterior a este guia), o
caminho seguro é **recriar o banco**:

```bash
cd ~/GestRest
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Recria o schema do zero (apaga tudo o que já existir no banco)
docker compose -f docker-compose.prod.yml --env-file .env exec backend npx prisma migrate reset --force --skip-seed

# Cria o seu super admin com e-mail e senha próprios
docker compose -f docker-compose.prod.yml --env-file .env exec backend \
  node dist/scripts/create-superadmin.js --email=seu@email.com --senha=SuaSenhaForte123 --nome="Seu Nome"
```

> ⚠️ **Se este servidor já tem clientes reais usando o sistema, NÃO rode `prisma migrate reset`** — isso apaga todos os pedidos e pagamentos. Fale comigo antes de rodar isso num banco com dados reais.

## Operação do dia a dia

Todos os comandos rodam dentro da pasta `GestRest`:

```bash
# Ver logs em tempo real
docker compose -f docker-compose.prod.yml logs -f

# Reiniciar
docker compose -f docker-compose.prod.yml restart

# Atualizar para a versão mais recente do código
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Parar tudo
docker compose -f docker-compose.prod.yml down
```

### Backup do banco

```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U gestrest gestrest > backup-$(date +%F).sql
```

---

## Onboarding de um restaurante com cardápio real (ex.: O Rei do Suco)

Para restaurantes com cardápio grande e complexo (ex.: dezenas de sabores de
suco em várias bases), a forma mais rápida é: **1)** criar o restaurante +
admin pelo painel `/super`, **2)** rodar o script de importação do cardápio.

```bash
# 1. No painel /super, clique "Novo Restaurante" e cadastre nome, slug e o
#    admin (e-mail/senha) daquele restaurante. Anote o slug (ex.: rei-do-suco).

# 2. Importe o cardápio completo para esse restaurante:
docker compose -f docker-compose.prod.yml --env-file .env exec backend \
  node dist/scripts/import-menu-rei-do-suco.js --slug=rei-do-suco
```

O script é **idempotente** — rodar de novo não duplica itens (produtos e
adicionais já existentes são ignorados). Ele cria as categorias, todos os
produtos com os preços reais do cardápio, e os grupos de adicionais.

Para o **suco montado na hora** (fruta + base + adicionais), o sistema conta
com um montador guiado na tela do garçom: ele escolhe a fruta, depois a base
(Água, Laranja, Leite, Frapê, Vinho — cada uma com seu preço correto) e por
fim os adicionais, sem precisar rolar uma lista enorme de combinações prontas.
Pastéis e mini pizzas "monte o seu" usam o campo de observações + adicionais
já existentes no pedido.

## Rodar junto com outros sistemas no mesmo servidor

Um servidor aguenta vários sistemas — o limite prático é a memória (veja com `free -h`
e `docker stats`). O único cuidado é a **porta**: só um sistema usa a porta 80.

Para o GestRest conviver com outro sistema, defina no `.env` uma porta livre e
inclua-a na URL pública:

```env
HTTP_PORT=8081
PUBLIC_URL=http://SEU_IP:8081
```

Depois recrie: `docker compose -f docker-compose.prod.yml --env-file .env up -d`.
O sistema passa a responder em `http://SEU_IP:8081`, deixando a porta 80 livre para
outro app. Cada sistema fica isolado na sua própria pasta, rede e banco.

> Dica: com um domínio, um reverse proxy (Caddy) na porta 80/443 roteia vários
> sistemas por subdomínio, sem portas na URL. Posso montar isso quando você quiser.

## Adicionar um domínio + HTTPS depois (opcional)

Quando tiver um domínio:

1. No seu provedor de DNS, crie um registro **A** apontando o domínio para o IP do Hetzner.
2. Instale um proxy com HTTPS automático (ex.: **Caddy**) na frente do frontend, ou publique o frontend na porta 443.
3. No `.env`, troque `PUBLIC_URL` para `https://seu-dominio` e defina `COOKIE_SECURE=true` no serviço `backend` do compose (cookies passam a exigir HTTPS).
4. Recrie: `docker compose -f docker-compose.prod.yml up -d --build`.

Posso montar essa configuração com Caddy quando você tiver o domínio — é só pedir.

---

## Solução de problemas

| Sintoma | O que verificar |
|---------|-----------------|
| Página não abre | Porta 80 liberada no firewall do Hetzner? `docker compose -f docker-compose.prod.yml ps` mostra tudo `Up`? |
| Login não persiste | `PUBLIC_URL` no `.env` bate com o endereço que você digita no navegador? |
| Erro 502 | Backend ainda subindo — veja `docker compose -f docker-compose.prod.yml logs backend` |
| "port is already allocated" | Algo já usa a porta 80 (`apache`/`nginx` do sistema). Pare com `systemctl stop apache2 nginx` |
