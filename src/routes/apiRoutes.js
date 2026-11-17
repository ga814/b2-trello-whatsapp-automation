import express from 'express';
import { db } from '../db.js';
import { unifiedWhatsAppService } from '../services/unifiedWhatsAppService.js';
import { trelloService } from '../services/trelloService.js';
import { notificationEngine } from '../services/notificationEngine.js';

export const apiRouter = express.Router();

apiRouter.get('/status', async (req, res) => {
  const settings = db.getSettings();
  const contacts = db.getContacts();

  const hasTrelloCreds = Boolean(settings.trello_api_key && settings.trello_token);
  const provider = settings.whatsapp_provider || 'zapi';
  const hasZApi = Boolean(settings.zapi_instance_id && settings.zapi_token);
  const hasMeta = Boolean(settings.whatsapp_phone_number_id && settings.whatsapp_access_token);
  const hasEvolution = Boolean(settings.evolution_base_url && settings.evolution_api_key);

  const isConfigured = provider === 'zapi' ? hasZApi : (provider === 'evolution' ? hasEvolution : hasMeta);

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
        provider: provider === 'zapi' ? 'Z-API (QR Code Fácil)' : (provider === 'evolution' ? 'Evolution API (QR Code)' : 'Meta Cloud API Oficial'),
        providerKey: provider,
        configured: isConfigured
      }
    }
  });
});

apiRouter.get('/config', (req, res) => {
  const settings = db.getSettings();
  const masked = { ...settings };
  if (masked.trello_token && masked.trello_token.length > 8) {
    masked.trello_token = `${masked.trello_token.substring(0, 4)}...${masked.trello_token.slice(-4)}`;
  }
  if (masked.zapi_token && masked.zapi_token.length > 8) {
    masked.zapi_token = `${masked.zapi_token.substring(0, 4)}...${masked.zapi_token.slice(-4)}`;
  }
  if (masked.whatsapp_access_token && masked.whatsapp_access_token.length > 8) {
    masked.whatsapp_access_token = `${masked.whatsapp_access_token.substring(0, 6)}...${masked.whatsapp_access_token.slice(-4)}`;
  }
  res.json(masked);
});

apiRouter.post('/config', (req, res) => {
  const updates = req.body;
  if (updates.trello_token && updates.trello_token.includes('...')) delete updates.trello_token;
  if (updates.zapi_token && updates.zapi_token.includes('...')) delete updates.zapi_token;
  if (updates.whatsapp_access_token && updates.whatsapp_access_token.includes('...')) delete updates.whatsapp_access_token;
  const saved = db.updateSettings(updates);
  res.json({ success: true, settings: saved });
});

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

apiRouter.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const status = req.query.status || null;
  const search = req.query.search || null;
  res.json(db.getLogs({ limit, status, search }));
});

apiRouter.post('/trello/verify', async (req, res) => {
  const result = await trelloService.verifyConnection();
  res.json(result);
});

apiRouter.post('/trello/setup-webhook', async (req, res) => {
  try {
    const { callbackUrl } = req.body;
    const url = callbackUrl || db.getSettings().app_public_url;
    if (!url) {
      return res.status(400).json({ error: 'Informe a URL pública da aplicação.' });
    }
    const fullCallback = url.endsWith('/api/webhooks/trello') ? url : `${url.replace(/\/$/, '')}/api/webhooks/trello`;
    const result = await trelloService.setupWebhook(fullCallback);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/whatsapp/verify', async (req, res) => {
  const result = await unifiedWhatsAppService.verifyConnection();
  res.json(result);
});

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
