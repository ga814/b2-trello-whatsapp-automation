import { db } from '../db.js';

export class TrelloService {
  constructor() {
    this.apiBaseUrl = 'https://api.trello.com/1';
  }

  getCredentials() {
    const settings = db.getSettings();
    return {
      apiKey: settings.trello_api_key || process.env.TRELLO_API_KEY,
      token: settings.trello_token || process.env.TRELLO_TOKEN,
      boardId: settings.trello_board_id || process.env.TRELLO_BOARD_ID || '6a67bc403bcaf1d86f059114'
    };
  }

  buildAuthQuery() {
    const { apiKey, token } = this.getCredentials();
    if (!apiKey || !token) {
      throw new Error('Chave da API ou Token do Trello não configurados.');
    }
    return `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
  }

  /**
   * Consulta dados do quadro (Board) e valida conexão
   */
  async verifyConnection() {
    try {
      const { boardId } = this.getCredentials();
      const auth = this.buildAuthQuery();
      const res = await fetch(`${this.apiBaseUrl}/boards/${boardId}?fields=name,url,closed&${auth}`);
      const data = await res.json();

      if (!res.ok) {
        return {
          valid: false,
          error: data?.message || data || 'Credenciais do Trello inválidas.'
        };
      }

      return {
        valid: true,
        boardName: data.name,
        boardUrl: data.url,
        closed: data.closed
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message
      };
    }
  }

  /**
   * Obtém listas e campos personalizados do quadro
   */
  async getBoardMetadata() {
    const { boardId } = this.getCredentials();
    const auth = this.buildAuthQuery();

    const [listsRes, customFieldsRes] = await Promise.all([
      fetch(`${this.apiBaseUrl}/boards/${boardId}/lists?${auth}`),
      fetch(`${this.apiBaseUrl}/boards/${boardId}/customFields?${auth}`)
    ]);

    const lists = await listsRes.json();
    const customFields = await customFieldsRes.json();

    return {
      lists: Array.isArray(lists) ? lists : [],
      customFields: Array.isArray(customFields) ? customFields : []
    };
  }

  /**
   * Registra ou renova o Webhook oficial do Trello para este quadro
   */
  async setupWebhook(callbackUrl) {
    const { boardId, apiKey, token } = this.getCredentials();
    const auth = this.buildAuthQuery();

    if (!callbackUrl) {
      throw new Error('URL pública de callback é obrigatória para registrar o Webhook do Trello.');
    }

    // 1. Lista webhooks existentes desse token
    const existingRes = await fetch(`${this.apiBaseUrl}/tokens/${token}/webhooks?key=${apiKey}`);
    const existingWebhooks = await existingRes.json();

    if (Array.isArray(existingWebhooks)) {
      for (const hook of existingWebhooks) {
        if (hook.idModel === boardId) {
          // Se já aponta para o mesmo callback, mantém
          if (hook.callbackURL === callbackUrl && hook.active) {
            db.updateSettings({ trello_webhook_id: hook.id });
            return {
              status: 'EXISTING_ACTIVE',
              webhookId: hook.id,
              callbackUrl: hook.callbackURL
            };
          }
          // Caso a URL tenha mudado, remove o antigo
          await fetch(`${this.apiBaseUrl}/webhooks/${hook.id}?${auth}`, { method: 'DELETE' });
        }
      }
    }

    // 2. Cria o novo webhook
    const createRes = await fetch(`${this.apiBaseUrl}/webhooks/?${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'B2 Energia Solar - WhatsApp Automation Webhook',
        callbackURL: callbackUrl,
        idModel: boardId,
        active: true
      })
    });

    const createdData = await createRes.json();

    if (!createRes.ok) {
      throw new Error(createdData?.message || JSON.stringify(createdData));
    }

    db.updateSettings({ trello_webhook_id: createdData.id });

    return {
      status: 'CREATED',
      webhookId: createdData.id,
      callbackUrl: createdData.callbackURL
    };
  }

  /**
   * Analisa a ação do Webhook e identifica se corresponde aos eventos monitorados
   */
  parseWebhookAction(action) {
    if (!action) return null;

    const actionId = action.id;
    const actionType = action.type;
    const data = action.data || {};
    const card = data.card || {};
    const clientName = card.name || 'Cliente';
    const cardId = card.id || '';
    const cardShortLink = card.shortLink || '';
    const cardUrl = cardShortLink 
      ? `https://trello.com/c/${cardShortLink}` 
      : (card.id ? `https://trello.com/c/${card.id}` : 'https://trello.com/b/88Ail8v8/projetos');

    // REGRA ESTRITA E ÚNICA: Disparo EXCLUSIVO e SOMENTE para 2 movimentações:
    // 1) Concessionária -> Vistoria  (Solicitação de Vistoria)
    // 2) Vistoria -> Concluídos      (Vistoria Concluída)
    // NENHUMA outra ação ou lista dispara WhatsApp (nem comentários, nem aprovação, nem novas UCs, nada)!
    if (actionType === 'updateCard' && data.listAfter && data.listBefore) {
      const targetListName = (data.listAfter.name || '').trim().toLowerCase();
      const previousListName = (data.listBefore.name || '').trim().toLowerCase();

      // Regra 1: Mudança para Vistoria (vindo de Concessionária ou Aprovado)
      if ((previousListName.includes('concession') || previousListName.includes('aprovad')) && targetListName.includes('vistoria') && !targetListName.includes('conclu')) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'VISTORIA_SOLICITADA',
          newStatus: data.listAfter.name || 'Solicitação de Vistoria',
          triggerSource: 'LIST_MOVE',
          prazoExecucao: '5 dias úteis para execução',
          detail: `Movido de [${data.listBefore.name}] para [${data.listAfter.name}]`
        };
      }

      // Regra 2: EXCLUSIVAMENTE de Vistoria para Concluído / Concluídos
      if (previousListName.includes('vistoria') && (targetListName.includes('concluíd') || targetListName.includes('concluid') || targetListName.includes('conclu'))) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'VISTORIA_CONCLUIDO',
          newStatus: data.listAfter.name || 'Vistoria Concluída',
          triggerSource: 'LIST_MOVE',
          prazoExecucao: '5 dias úteis para execução',
          detail: `Movido de [${data.listBefore.name}] para [${data.listAfter.name}]`
        };
      }
    }

    // NADA MAIS dispara WhatsApp sob nenhuma hipótese
    return null;
  }

  /**
   * Busca a última nota de vistoria comentada no cartão
   */
  async getLatestVistoriaNoteFromCard(cardId) {
    if (!cardId) return null;
    try {
      const { apiKey, token } = this.getCredentials();
      const res = await fetch(`${this.apiBaseUrl}/cards/${cardId}/actions?filter=commentCard&limit=5&key=${apiKey}&token=${token}`);
      if (!res.ok) return null;
      const comments = await res.json();
      if (!Array.isArray(comments)) return null;

      for (const c of comments) {
        const text = c.data?.text || '';
        if (/vistoria|nota/i.test(text)) {
          const match = text.match(/(?:nota(?:\s+de\s+(?:servi[çc]o|atendimento|vistoria))?|vistoria)\s*[:\-=]?\s*\*?\*?([0-9]{6,15})\*?\*?/i) ||
                        text.match(/\b([0-9]{10,14})\b/);
          if (match) return match[1];
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const trelloService = new TrelloService();
