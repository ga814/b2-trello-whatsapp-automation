import express from 'express';
import { db } from '../db.js';
import { metaWhatsAppService } from '../services/metaWhatsAppService.js';
import { trelloService } from '../services/trelloService.js';
import { notificationEngine } from '../services/notificationEngine.js';

export const apiRouter = express.Router();

/**
 * Retorna status geral do sistema e conexões
 */
apiRouter.get('/status', async (req, res) => {
  const settings = db.getSettings();
  const contacts = db.getContacts();
  const logs = db.getLogs({ limit: 10 });

  const hasTrelloCreds = Boolean(settings.trello_api_key && settings.trello_token);
  const hasMetaCreds = Boolean(settings.whatsapp_phone_number_id && settings.whatsapp_access_token);

  res.json({
    system: 'ONLINE',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    stats: {
      totalContacts: contacts.length,
      activeContacts: contacts.filter(c => c.active).length,
      totalNotificationsSent: db.getLogs().length,
      recentFailures: db.getLogs({ limit: 50, status: 'FAILED' }).length
    },
    integrations: {
      trello: {
        configured: hasTrelloCreds,
        boardId: settings.trello_board_id,
        webhookId: settings.trello_webhook_id || null
      },
      whatsapp: {
        provider: 'Meta WhatsApp Cloud API (Oficial)',
        configured: hasMetaCreds,
        phoneNumberId: settings.whatsapp_phone_number_id || null
      }
    }
  });
});

/**
 * Configurações
 */
apiRouter.get('/config', (req, res) => {
  const settings = db.getSettings();
  // Mascara tokens sensíveis
  const masked = { ...settings };
  if (masked.trello_token && masked.trello_token.length > 8) {
    masked.trello_token = `${masked.trello_token.substring(0, 4)}...${masked.trello_token.slice(-4)}`;
  }
  if (masked.whatsapp_access_token && masked.whatsapp_access_token.length > 8) {
    masked.whatsapp_access_token = `${masked.whatsapp_access_token.substring(0, 6)}...${masked.whatsapp_access_token.slice(-4)}`;
  }
  res.json(masked);
});

apiRouter.post('/config', (req, res) => {
  const updates = req.body;
  // Não sobrescreve com tokens mascarados caso o usuário não tenha editado
  if (updates.trello_token && updates.trello_token.includes('...')) {
    delete updates.trello_token;
  }
  if (updates.whatsapp_access_token && updates.whatsapp_access_token.includes('...')) {
    delete updates.whatsapp_access_token;
  }
  const saved = db.updateSettings(updates);
  res.json({ success: true, settings: saved });
});

/**
 * Contatos
 */
apiRouter.get('/contacts', (req, res) => {
  res.json(db.getContacts());
});

apiRouter.post('/contacts', (req, res) => {
  const { name, phone, events, active } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
  }
  const created = db.addContact({ name, phone, events, active });
  res.status(201).json(created);
});

apiRouter.put('/contacts/:id', (req, res) => {
  const updated = db.updateContact(req.params.id, req.body);
  if (!updated) {
    return res.status(400).json({ error: 'Contato não encontrado.' });
  }
  res.json(updated);
});

apiRouter.delete('/contacts/:id', (req, res) => {
  const ok = db.deleteContact(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Contato não encontrado.' });
  }
  res.json({ success: true });
});

/**
 * Histórico de Notificações / Logs
 */
apiRouter.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const status = req.query.status || null;
  const search = req.query.search || null;
  res.json(db.getLogs({ limit, status, search }));
});

/**
 * Verificação e Registro no Trello
 */
apiRouter.post('/trello/verify', async (req, res) => {
  const result = await trelloService.verifyConnection();
  res.json(result);
});

apiRouter.post('/trello/setup-webhook', async (req, res) => {
  try {
    const { callbackUrl } = req.body;
    const url = callbackUrl || db.getSettings().app_public_url;
    if (!url) {
      return res.status(400).json({ error: 'Informe a URL pública da aplicação (ex: https://meu-app.onrender.com/api/webhooks/trello).' });
    }
    const fullCallback = url.endsWith('/api/webhooks/trello') ? url : `${url.replace(/\/$/, '')}/api/webhooks/trello`;
    const result = await trelloService.setupWebhook(fullCallback);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Verificação do WhatsApp Meta Cloud API
 */
apiRouter.post('/whatsapp/verify', async (req, res) => {
  const result = await metaWhatsAppService.verifyConnection();
  res.json(result);
});

/**
 * Teste Manual de Notificação
 */
apiRouter.post('/test-notify', async (req, res) => {
  const { phone, name, eventType, clientName } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Número de telefone é obrigatório para teste.' });
  }
  try {
    const result = await notificationEngine.sendTestNotification({
      phone,
      name: name || 'Contato Teste',
      eventType: eventType || 'CONCESSIONARIA_APROVADO',
      clientName: clientName || 'PROJETO TESTE B2 ENERGIA'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
