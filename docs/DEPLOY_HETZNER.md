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
| `PUBLIC_URL` | `http://SEU_IP` (o IP do servidor, sem barra no final) |

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

O script instala o Docker (se faltar), libera a porta 80, sobe o banco + backend + frontend, aplica as migrações e popula os dados iniciais. Ao final mostra o endereço de acesso.

## 5. Liberar a porta 80 no firewall do Hetzner

Se você criou um **Firewall** no painel do Hetzner Cloud, adicione uma regra de entrada:

- Painel Hetzner → seu servidor → *Firewalls* → *Rules* → **Inbound**
- Adicione: `TCP` porta `80` de origem `Any IPv4 / Any IPv6`

(Sem firewall do Hetzner, o script já cuida do `ufw` interno.)

## 6. Acessar

Abra no navegador:

```
http://SEU_IP
```

Entre com um usuário demo (senha `123456`): `admin@gestrest.com`.

> **Importante:** em produção, entre em **Usuários**, crie as contas reais da sua equipe e **remova/altere** os usuários de demonstração.

---

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
