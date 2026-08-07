# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage (nginx) ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# Sem "USER nginx" explícito de propósito: o processo master do nginx precisa de root só
# pra abrir a porta 80 (< 1024) e supervisionar os workers — a imagem oficial nginx:alpine
# já faz os workers (que de fato processam requisição) rodarem como o usuário não-root
# "nginx" por padrão, então o request handling em si não roda como root. Forçar USER nginx
# aqui quebraria o bind na porta 80 sem também trocar pra uma porta >1024 e reconfigurar o
# proxy do host — mudança maior que o ganho de segurança, dado que o worker já é não-root.
CMD ["nginx", "-g", "daemon off;"]
