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

    // 1. GATILHO POR CAMPO PERSONALIZADO (updateCustomFieldItem)
    if (actionType === 'updateCustomFieldItem') {
      const customField = data.customField || {};
      const customFieldItem = data.customFieldItem || {};
      const fieldName = (customField.name || '').trim().toLowerCase();

      // Valor novo selecionado (dropdown)
      const selectedOption = data.customFieldOption?.value?.text || 
                             customFieldItem.value?.text || 
                             '';
      const cleanValue = selectedOption.trim().toLowerCase();

      // Regra 1: Concessionária -> Aprovado
      if (fieldName.includes('concession') && cleanValue.includes('aprovad')) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'CONCESSIONARIA_APROVADO',
          newStatus: selectedOption || 'Aprovado',
          triggerSource: 'CUSTOM_FIELD'
        };
      }

      // Regra 2: Vistoria -> Concluído
      if (fieldName.includes('vistoria') && (cleanValue.includes('conclu') || cleanValue.includes('aprovad'))) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'VISTORIA_CONCLUIDO',
          newStatus: selectedOption || 'Concluído',
          triggerSource: 'CUSTOM_FIELD'
        };
      }
    }

    // 2. GATILHO POR MOVIMENTAÇÃO DE LISTA (updateCard - listAfter)
    if (actionType === 'updateCard' && data.listAfter) {
      const targetListName = (data.listAfter.name || '').trim().toLowerCase();
      const previousListName = (data.listBefore?.name || '').trim().toLowerCase();

      // Se moveu para a lista "Aprovado"
      if (targetListName === 'aprovado' || (targetListName.includes('aprovad') && !targetListName.includes('reprovad'))) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'CONCESSIONARIA_APROVADO',
          newStatus: data.listAfter.name || 'Aprovado na Concessionária',
          triggerSource: 'LIST_MOVE',
          detail: `Movido de [${data.listBefore?.name || 'Lista'}] para [${data.listAfter.name}]`
        };
      }

      // Se moveu para a lista "🎉 Concluídos"
      if (targetListName.includes('concluíd') || targetListName.includes('concluid')) {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'VISTORIA_CONCLUIDO',
          newStatus: data.listAfter.name || 'Vistoria Concluída',
          triggerSource: 'LIST_MOVE',
          detail: `Movido de [${data.listBefore?.name || 'Lista'}] para [${data.listAfter.name}]`
        };
      }
    }

    // 3. GATILHO POR ETIQUETA (addLabelToCard)
    if (actionType === 'addLabelToCard' && data.label) {
      const labelName = (data.label.name || '').trim().toLowerCase();
      if (labelName === 'concluido' || labelName === 'concluído') {
        return {
          actionId,
          cardId,
          clientName,
          cardUrl,
          eventType: 'VISTORIA_CONCLUIDO',
          newStatus: 'Concluído (Etiqueta)',
          triggerSource: 'LABEL',
          detail: `Etiqueta ${data.label.name} adicionada`
        };
      }
    }

    return null;
  }
}

export const trelloService = new TrelloService();
