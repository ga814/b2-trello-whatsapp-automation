import { db } from '../db.js';
import { unifiedWhatsAppService } from './unifiedWhatsAppService.js';
import { trelloService } from './trelloService.js';

export class NotificationEngine {
  async processTrelloWebhook(payload) {
    const action = payload?.action;
    if (!action) {
      return { status: 'IGNORED', reason: 'Nenhuma action encontrada no payload' };
    }

    const eventData = trelloService.parseWebhookAction(action);
    if (!eventData) {
      return { status: 'IGNORED', reason: 'Ação não corresponde às regras de notificação configuradas' };
    }

    // Deduplicação estrita por action.id do Trello
    if (db.isActionProcessed(eventData.actionId)) {
      console.log(`[Deduplicação] Action ${eventData.actionId} já foi processada anteriormente. Ignorando.`);
      return { 
        status: 'DUPLICATE_IGNORED', 
        actionId: eventData.actionId,
        message: 'Evento ignorado por deduplicação de Webhook' 
      };
    }

    db.markActionProcessed(eventData.actionId);

    const eventKey = eventData.eventType === 'CONCESSIONARIA_APROVADO' 
      ? 'concessionaria_aprovado' 
      : 'vistoria_concluido';

    const allContacts = db.getContacts();
    const targetContacts = allContacts.filter(c => 
      c.active && Array.isArray(c.events) && c.events.includes(eventKey)
    );

    if (targetContacts.length === 0) {
      const log = db.addLog({
        event_type: eventData.eventType,
        client_name: eventData.clientName,
        card_id: eventData.cardId,
        card_url: eventData.cardUrl,
        recipients_count: 0,
        recipients: [],
        status: 'IGNORED',
        error_message: 'Nenhum contato ativo cadastrado para este evento.',
        action_id: eventData.actionId
      });
      return { status: 'NO_RECIPIENTS', log };
    }

    const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    }).format(new Date());

    let notaVistoria = eventData.notaVistoria || null;
    if (!notaVistoria && (eventData.eventType.includes('VISTORIA') || eventData.eventType === 'VISTORIA_CONCLUIDO') && eventData.cardId) {
      try {
        notaVistoria = await trelloService.getLatestVistoriaNoteFromCard(eventData.cardId);
      } catch (err) {
        console.warn('Erro ao buscar nota de vistoria no cartão:', err.message);
      }
    }

    const messageText = unifiedWhatsAppService.buildNotificationMessage({
      clientName: eventData.clientName,
      eventType: eventData.eventType,
      newStatus: eventData.newStatus,
      cardUrl: eventData.cardUrl,
      dateFormatted,
      notaVistoria,
      prazoExecucao: eventData.prazoExecucao || '5 dias úteis para execução'
    });

    const results = await Promise.allSettled(
      targetContacts.map(async (contact) => {
        try {
          const res = await unifiedWhatsAppService.sendMessage(contact.phone, messageText);
          return {
            contact_id: contact.id,
            name: contact.name,
            phone: contact.phone,
            status: 'SUCCESS',
            message_id: res.messageId,
            provider: res.provider
          };
        } catch (err) {
          return {
            contact_id: contact.id,
            name: contact.name,
            phone: contact.phone,
            status: 'FAILED',
            error: err.message
          };
        }
      })
    );

    const recipientSummaries = results.map(r => r.status === 'fulfilled' ? r.value : {
      status: 'FAILED',
      error: r.reason?.message || 'Erro desconhecido'
    });

    const successCount = recipientSummaries.filter(r => r.status === 'SUCCESS').length;
    const finalStatus = successCount === targetContacts.length 
      ? 'SUCCESS' 
      : (successCount > 0 ? 'PARTIAL' : 'FAILED');

    const logEntry = db.addLog({
      event_type: eventData.eventType,
      client_name: eventData.clientName,
      card_id: eventData.cardId,
      card_url: eventData.cardUrl,
      recipients_count: targetContacts.length,
      recipients: recipientSummaries,
      status: finalStatus,
      error_message: finalStatus === 'FAILED' ? 'Falha no envio para os destinatários' : null,
      action_id: eventData.actionId,
      message_preview: messageText
    });

    return {
      status: finalStatus,
      clientName: eventData.clientName,
      recipientsNotified: successCount,
      log: logEntry
    };
  }

  async sendTestNotification({ phone, name = 'Contato Teste', eventType = 'CONCESSIONARIA_APROVADO', clientName = 'CLIENTE MODELO (TESTE)', notaVistoria = '045006474058' }) {
    const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    }).format(new Date());

    const isVistoria = eventType.includes('VISTORIA');
    const messageText = unifiedWhatsAppService.buildNotificationMessage({
      clientName,
      eventType,
      newStatus: eventType === 'CONCESSIONARIA_APROVADO' ? 'Aprovado (Simulação)' : 'Vistoria Solicitada (Simulação)',
      cardUrl: 'https://trello.com/b/88Ail8v8/projetos',
      dateFormatted,
      notaVistoria: isVistoria ? notaVistoria : null,
      prazoExecucao: '5 dias úteis para execução'
    });

    try {
      const sendResult = await unifiedWhatsAppService.sendMessage(phone, messageText);
      const log = db.addLog({
        event_type: `TESTE_${eventType}`,
        client_name: clientName,
        card_id: 'test_card',
        card_url: 'https://trello.com/b/88Ail8v8/projetos',
        recipients_count: 1,
        recipients: [{
          name,
          phone,
          status: 'SUCCESS',
          message_id: sendResult.messageId,
          provider: sendResult.provider
        }],
        status: 'SUCCESS',
        error_message: null,
        action_id: `test_${Date.now()}`,
        message_preview: messageText
      });

      return {
        success: true,
        messageId: sendResult.messageId,
        provider: sendResult.provider,
        log
      };
    } catch (err) {
      const log = db.addLog({
        event_type: `TESTE_${eventType}`,
        client_name: clientName,
        card_id: 'test_card',
        card_url: 'https://trello.com/b/88Ail8v8/projetos',
        recipients_count: 1,
        recipients: [{
          name,
          phone,
          status: 'FAILED',
          error: err.message
        }],
        status: 'FAILED',
        error_message: err.message,
        action_id: `test_${Date.now()}`,
        message_preview: messageText
      });

      throw err;
    }
  }
}

export const notificationEngine = new NotificationEngine();
