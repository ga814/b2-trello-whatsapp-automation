# ☀️ B2 Energia Solar | Automação Trello ➔ WhatsApp 24/7

Sistema profissional de automação e monitoramento contínuo em nuvem para a **B2 Energia Solar**, integrando o quadro **Projetos** do Trello à **Meta WhatsApp Cloud API Oficial**.

---

## 🚀 Funcionalidades Principais

1. **Monitoramento 24 Horas em Nuvem:**
   - Funciona ininterruptamente mesmo com o computador desligado através de Webhooks oficiais do Trello.
2. **Gatilhos de Notificação:**
   - **Gatilho 1 (Concessionária):** Dispara quando o campo `Concessionária` mudar para `Aprovado` (ou o cartão for movido para a lista `Aprovado`).
   - **Gatilho 2 (Vistoria):** Dispara quando o campo `Vistoria` mudar para `Concluído` (ou o cartão for movido para a lista `🎉 Concluídos` ou receber a etiqueta `CONCLUIDO`).
3. **Mensagem Padronizada B2 Energia Solar:**
   - Nome do cliente, novo status, data/hora formatada em horário de Brasília e link direto do cartão no Trello.
4. **Mecanismo Anti-Duplicidade (Idempotência Estrita):**
   - Rastreamento por `action.id` para evitar notificações repetidas em caso de retries do Trello.
5. **Painel Administrativo Completo:**
   - Dashboard de métricas e taxa de sucesso.
   - Gestão de contatos com seleção granular de eventos por destinatário.
   - Histórico e auditoria de disparos com payload e motivo de eventuais falhas.
   - Botão de teste manual em tempo real.
   - Registro automático do Webhook na API do Trello em um clique.

---

## 📋 Pré-requisitos & Credenciais

### 1. Trello API
1. Acesse: [https://trello.com/power-ups/admin](https://trello.com/power-ups/admin)
2. Clique em **Novo Power-Up** (ou acesse a área de Chaves de API).
3. Copie a **Chave de API (API Key)**.
4. Clique no link ao lado para **Gerar um Token** e autorize.
5. Copie o **Token**.
> *O ID do quadro `Projetos` já está pré-configurado: `6a67bc403bcaf1d86f059114`.*

### 2. Meta WhatsApp Cloud API (Oficial)
1. Acesse o portal [Meta for Developers](https://developers.facebook.com/).
2. Crie ou selecione o aplicativo do tipo **Negócios (Business)**.
3. Adicione o produto **WhatsApp**.
4. No painel do WhatsApp, copie o **Phone Number ID** e o **WhatsApp Business Account ID (WABA ID)**.
5. No **Meta Business Manager** (Configurações do Negócio $\rightarrow$ Usuários do Sistema), gere um token de acesso permanente com a permissão `whatsapp_business_messaging`.

---

## ☁️ Implantação Gratuita 24/7 (Passo a Passo)

### Opção Recomendada: Render.com (Plano Gratuito com HTTPS)

1. Crie uma conta gratuita em [render.com](https://render.com).
2. Clique em **New +** $\rightarrow$ **Web Service**.
3. Conecte o repositório Git deste projeto ou faça upload.
4. Configure os seguintes parâmetros:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Plan:** `Free`
5. Em **Environment Variables**, adicione as variáveis conforme o `.env.example`:
   - `TRELLO_API_KEY`
   - `TRELLO_TOKEN`
   - `TRELLO_BOARD_ID`: `6a67bc403bcaf1d86f059114`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_WABA_ID`
   - `WHATSAPP_ACCESS_TOKEN`
   - `APP_PUBLIC_URL`: A URL gerada pelo Render (ex: `https://b2-automacao.onrender.com`)
6. Clique em **Create Web Service**.
7. Após o deploy, abra o painel administrativo (`https://b2-automacao.onrender.com`), vá na aba **Integrações** e clique em **Registrar Webhook**!

---

## 💻 Execução Local / Desenvolvimento

```bash
# Instalar dependências
npm install

# Executar testes automatizados
npm test

# Iniciar servidor local
npm start
```

O painel administrativo estará acessível em: `http://localhost:3000`

---

## 🔒 Segurança

- Tokens de autenticação são mascarados no painel frontend.
- Todas as requisições de Webhook são autenticadas e validadas.
- O banco de dados JSON atômico é mantido em diretório isolado (`data/`).
