# Landing Page — Inspiralle Odontologia Especializada

Landing page estática (HTML/CSS/JS puro, sem build), pensada para receber
visitantes vindos do Google e converter agendamentos pelo WhatsApp.

## Como visualizar

Abra `index.html` diretamente no navegador, ou sirva a pasta com qualquer
servidor estático:

```bash
cd inspiralle-landing
python3 -m http.server 8000
```

## Dados reais usados na página

Extraídos do perfil do Instagram (@inspiralleodontologia) e da ficha do
Google (Inspiralle Odontologia, Americana - SP):

- Endereço: R. Iacanga, 631 - Vila Molon, Americana - SP, 13468-590
- Telefone / WhatsApp: (19) 99939-3772
- Avaliação Google: 5,0 ★ (88 avaliações)
- Instagram: @inspiralleodontologia (4,4 mil seguidores)
- Linktree: linktr.ee/Inspiralleamericana
- Tratamentos citados nas publicações/destaques: clareamento dental,
  próteses fixas, extração de siso, sensibilidade dentária.

## Pendências para preencher com material real da clínica

As referências fornecidas (prints do Instagram e do Google) não incluem
arquivos de imagem em alta resolução nem textos completos (ex: depoimentos
escritos, nomes/especialidades da equipe, horário completo de
funcionamento). Por isso, a página **não inventa** esses dados — eles foram
substituídos por texturas/gradientes na identidade visual da marca até que
sejam enviados os arquivos reais. Para finalizar:

1. Adicionar fotos reais em `assets/images/` e trocar os blocos com
   gradiente por `<img>`/`background-image`:
   - Hero (`.hero`)
   - Fachada, recepção, consultório, estrutura, equipe, detalhes (`#galeria`)
   - Foto da fachada em `#sobre`
2. Confirmar horário completo de funcionamento (a referência só mostra
   "abre segunda às 09:00" e "fecha às 12:00" em um dia específico).
3. Se houver depoimentos de pacientes com texto (não só a nota agregada),
   adicionar uma seção de citações reais.
4. Se houver nomes e especialidades da equipe, adicionar seção "Equipe".
5. Confirmar CNPJ/razão social e domínio final para ajustar
   `og:url`/`canonical` no `<head>`.

## Estrutura

- `index.html` — marcação semântica, SEO (title, meta description, JSON-LD
  `Dentist`), todas as seções.
- `styles.css` — design system (cores navy + dourado da marca, tipografia,
  grid responsivo, animações).
- `script.js` — header dinâmico, menu mobile, fade-in no scroll
  (`IntersectionObserver`).
- `assets/favicon.svg` — ícone com o mesmo desenho do dente do logo.
