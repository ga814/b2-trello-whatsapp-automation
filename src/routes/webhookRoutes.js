import express from 'express';
import { notificationEngine } from '../services/notificationEngine.js';

export const webhookRouter = express.Router();

/**
 * Trello exige resposta 200 para requisições HEAD e GET ao validar a URL do Webhook
 */
webhookRouter.head('/trello', (req, res) => {
  res.status(200).send('OK');
});

webhookRouter.get('/trello', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Endpoint de Webhook do Trello ativo e pronto para receber eventos.' });
});

/**
 * Recebe eventos em tempo real do Trello
 */
webhookRouter.post('/trello', async (req, res) => {
  // Responde imediatamente com 200 para o Trello não desativar o Webhook por timeout
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    console.log(`[Trello Webhook] Evento recebido: action.type=${payload?.action?.type}, id=${payload?.action?.id}`);
    
    // Processamento assíncrono em segundo plano
    const result = await notificationEngine.processTrelloWebhook(payload);
    console.log('[Trello Webhook] Resultado do processamento:', JSON.stringify(result));
  } catch (err) {
    console.error('[Trello Webhook] Erro ao processar payload:', err);
  }
});
