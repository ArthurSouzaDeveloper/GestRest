# Deploy no Hetzner (com domínio e HTTPS)

Guia para publicar o GestRest num servidor Hetzner Cloud, acessível pelo **domínio próprio, com HTTPS automático** (certificado via Let's Encrypt, renovado sozinho pelo Caddy — nenhum passo manual de certbot).

> Pré-requisitos: um servidor Hetzner já criado (Ubuntu 22.04/24.04), o IP + acesso SSH como `root`, e um domínio (ou subdomínio) que você controla o DNS.

## 1. Apontar o DNS para o servidor (antes de tudo)

No painel do seu provedor de domínio, crie um registro **A** apontando o domínio (e `www`, se for usar) para o IP do servidor Hetzner. Isso pode levar alguns minutos a algumas horas para propagar — pode seguir com os próximos passos enquanto espera, o Caddy só precisa disso funcionar na hora de emitir o certificado (e tenta de novo sozinho se ainda não propagou).

## 2. Conectar no servidor

```bash
ssh root@SEU_IP
```

## 3. Instalar o Git e clonar o projeto

```bash
apt update && apt install -y git
git clone https://github.com/ArthurSouzaDeveloper/GestRest.git
cd GestRest
```

> Se o repositório for privado, o Git vai pedir usuário e um **token de acesso** do GitHub (em vez de senha).

## 4. Configurar os segredos (.env)

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
| `DOMAIN` | O domínio que você apontou no passo 1, sem `http://` (ex.: `gestrest.app.br`) |

Gere os segredos facilmente:

```bash
openssl rand -hex 32   # copie a saída para JWT_ACCESS_SECRET
openssl rand -hex 32   # copie a saída para JWT_REFRESH_SECRET
```

Salve no `nano` com `Ctrl+O`, `Enter`, depois `Ctrl+X`.

## 5. Subir tudo (um comando)

```bash
bash deploy/hetzner-setup.sh
```

O script instala o Docker (se faltar), libera as portas 80/443, sobe o banco + backend + frontend + Caddy, aplica as migrações e pede o e-mail/senha do **seu** super admin (não vem nenhuma conta com senha padrão). Ao final mostra o endereço de acesso.

## 6. Liberar as portas no firewall do Hetzner

Se você criou um **Firewall** no painel do Hetzner Cloud, adicione regras de entrada:

- Painel Hetzner → seu servidor → *Firewalls* → *Rules* → **Inbound**
- Adicione: `TCP` porta `80` de origem `Any IPv4 / Any IPv6`
- Adicione: `TCP` porta `443` de origem `Any IPv4 / Any IPv6`

(Sem firewall do Hetzner, o script já cuida do `ufw` interno.)

## 7. Acessar

Abra no navegador:

```
https://SEU_DOMINIO
```

> O certificado pode levar 1-2 minutos pra ficar pronto na primeira vez. Se o navegador avisar de certificado inválido logo depois de subir, aguarde um pouco e recarregue — é o Caddy ainda emitindo.

Acesse `https://SEU_DOMINIO/super` com o e-mail e a senha que você digitou no passo 5.

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

Automatizado via cron (recomendado — ver `deploy/backup-db.sh`, comentário no topo do
arquivo tem o exemplo de linha de cron). Manualmente:

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
e `docker stats`). Como o Caddy já roteia por **domínio** (não por porta), dá pra ter
vários sistemas no mesmo servidor, cada um com seu próprio domínio/subdomínio, todos
na porta 80/443 — não precisa inventar porta alternativa como antes. Cada sistema fica
isolado na sua própria pasta, rede, banco e (se usar este mesmo `docker-compose.prod.yml`
como modelo) seu próprio Caddy — ou, com mais trabalho, um único Caddy compartilhado
roteando pra vários projetos por domínio. Posso montar essa versão compartilhada quando
precisar.

---

## Solução de problemas

| Sintoma | O que verificar |
|---------|-----------------|
| Página não abre | Portas 80 e 443 liberadas no firewall do Hetzner? `docker compose -f docker-compose.prod.yml ps` mostra tudo `Up`? |
| Certificado inválido/não confiável | DNS do `DOMAIN` já propagou de verdade para este IP? (`dig +short SEU_DOMINIO` no seu computador deve mostrar o IP do servidor) `docker compose -f docker-compose.prod.yml logs caddy` mostra o que está tentando |
| Login não persiste | Está acessando por `https://` (não `http://`)? Com HTTPS, o cookie exige conexão segura |
| Erro 502 | Backend ainda subindo — veja `docker compose -f docker-compose.prod.yml logs backend` |
| "port is already allocated" | Algo já usa a porta 80/443 (`apache`/`nginx` do sistema, ou outro Caddy). Pare com `systemctl stop apache2 nginx` |
