import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Garante que o diretório de dados exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Estrutura inicial do banco de dados
const defaultData = {
  settings: {
    trello_api_key: process.env.TRELLO_API_KEY || 'ab7fba0f09b59fd590a77635399f9d65',
    trello_token: process.env.TRELLO_TOKEN || 'ATTA6ad8ccf8f3602ad10b016e77c6b6acc069433d4794ed8196ee3505053463a4beA4762E88',
    trello_board_id: process.env.TRELLO_BOARD_ID || '6a67bc403bcaf1d86f059114',
    trello_webhook_id: '6afc858aed7794afc8c01b54',
    app_public_url: process.env.APP_PUBLIC_URL || 'https://b2-trello-whatsapp-automation.onrender.com',

    // Provedor ativo de WhatsApp: 'zapi' | 'evolution' | 'meta'
    whatsapp_provider: 'zapi',

    // Z-API (QR Code rápido)
    zapi_instance_id: process.env.ZAPI_INSTANCE_ID || '',
    zapi_token: process.env.ZAPI_TOKEN || '',
    zapi_client_token: process.env.ZAPI_CLIENT_TOKEN || '',

    // Evolution API (QR Code alternativo)
    evolution_base_url: process.env.EVOLUTION_BASE_URL || '',
    evolution_instance_name: process.env.EVOLUTION_INSTANCE_NAME || '',
    evolution_api_key: process.env.EVOLUTION_API_KEY || '',

    // Meta Cloud API Oficial
    whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsapp_waba_id: process.env.WHATSAPP_WABA_ID || '',
    whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',

    concessionaria_field_name: 'Concessionária',
    concessionaria_target_value: 'Aprovado',
    vistoria_field_name: 'Vistoria',
    vistoria_target_value: 'Concluído'
  },
  contacts: [
    {
      id: 'contact_default_1',
      name: 'Gabriel Vinicius',
      phone: '5527988934211',
      events: ['concessionaria_aprovado', 'vistoria_concluido'],
      active: true,
      created_at: new Date().toISOString()
    }
  ],
  logs: [],
  processed_actions: {}
};

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      saveDatabase(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      settings: { ...defaultData.settings, ...(parsed.settings || {}) },
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : defaultData.contacts,
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      processed_actions: parsed.processed_actions || {}
    };
  } catch (err) {
    console.error('[DB] Erro ao carregar banco de dados, usando defaults:', err.message);
    return defaultData;
  }
}

function saveDatabase(data) {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

let dbCache = loadDatabase();

export const db = {
  getSettings() {
    return { ...dbCache.settings };
  },
  updateSettings(newSettings) {
    dbCache.settings = { ...dbCache.settings, ...newSettings };
    saveDatabase(dbCache);
    return { ...dbCache.settings };
  },
  getContacts() {
    return [...dbCache.contacts];
  },
  getContact(id) {
    return dbCache.contacts.find(c => c.id === id);
  },
  addContact(contact) {
    const newContact = {
      id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: contact.name,
      phone: contact.phone.replace(/\D/g, ''),
      events: contact.events || ['concessionaria_aprovado', 'vistoria_concluido'],
      active: contact.active !== false,
      created_at: new Date().toISOString()
    };
    dbCache.contacts.push(newContact);
    saveDatabase(dbCache);
    return newContact;
  },
  updateContact(id, updates) {
    const idx = dbCache.contacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    if (updates.phone) {
      updates.phone = updates.phone.replace(/\D/g, '');
    }
    dbCache.contacts[idx] = { ...dbCache.contacts[idx], ...updates };
    saveDatabase(dbCache);
    return dbCache.contacts[idx];
  },
  deleteContact(id) {
    const idx = dbCache.contacts.findIndex(c => c.id === id);
    if (idx === -1) return false;
    dbCache.contacts.splice(idx, 1);
    saveDatabase(dbCache);
    return true;
  },
  isActionProcessed(actionId) {
    if (!actionId) return false;
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const actionTime = dbCache.processed_actions[actionId];
    if (actionTime && (now - actionTime < sevenDays)) {
      return true;
    }
    return false;
  },
  markActionProcessed(actionId) {
    if (!actionId) return;
    dbCache.processed_actions[actionId] = Date.now();
    saveDatabase(dbCache);
  },
  getLogs({ limit = 100, status = null, search = null } = {}) {
    let result = [...dbCache.logs];
    if (status) {
      result = result.filter(l => l.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => 
        (l.client_name && l.client_name.toLowerCase().includes(q)) ||
        (l.event_type && l.event_type.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return result.slice(0, limit);
  },
  addLog(logEntry) {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    dbCache.logs.unshift(entry);
    if (dbCache.logs.length > 1000) {
      dbCache.logs = dbCache.logs.slice(0, 1000);
    }
    saveDatabase(dbCache);
    return entry;
  }
};
