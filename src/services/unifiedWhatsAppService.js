import { db } from '../db.js';

/**
 * Serviço Unificado de WhatsApp com suporte a Gateways QR Code (Z-API, Evolution API) e Meta Cloud API
 */
export class UnifiedWhatsAppService {
  /**
   * Formata número para o padrão internacional E.164 (ex: 5527988934211)
   */
  formatPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = `55${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Envia mensagem usando o provedor configurado
   */
  async sendMessage(toPhone, messageText) {
    const settings = db.getSettings();
    const provider = settings.whatsapp_provider || 'zapi';
    const formattedTo = this.formatPhoneNumber(toPhone);

    if (provider === 'zapi') {
      return this.sendViaZApi(formattedTo, messageText, settings);
    } else if (provider === 'evolution') {
      return this.sendViaEvolution(formattedTo, messageText, settings);
    } else if (provider === 'meta') {
      return this.sendViaMeta(formattedTo, messageText, settings);
    } else {
      throw new Error(`Provedor de WhatsApp desconhecido: ${provider}`);
    }
  }

  /**
   * Disparo via Z-API (QR Code em z-api.io)
   */
  async sendViaZApi(to, message, settings) {
    const instanceId = settings.zapi_instance_id;
    const token = settings.zapi_token;
    const clientToken = settings.zapi_client_token;

    if (!instanceId || !token) {
      throw new Error('Configuração da Z-API incompleta. Informe o Instance ID e o Token no Painel.');
    }

    const endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: to,
        message: message
      })
    });

    const data = await response.json();

    if (!response.ok || (data && data.error)) {
      throw new Error(data?.message || data?.error || `Falha Z-API HTTP ${response.status}`);
    }

    return {
      success: true,
      provider: 'Z-API',
      messageId: data.id || data.zaapId || data.messageId || 'zapi_msg',
      raw: data
    };
  }

  /**
   * Disparo via Evolution API (QR Code)
   */
  async sendViaEvolution(to, message, settings) {
    const baseUrl = (settings.evolution_base_url || '').replace(/\/$/, '');
    const instanceName = settings.evolution_instance_name;
    const apiKey = settings.evolution_api_key;

    if (!baseUrl || !instanceName || !apiKey) {
      throw new Error('Configuração da Evolution API incompleta. Informe a URL, Instância e API Key.');
    }

    const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        number: to,
        text: message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || `Falha Evolution API HTTP ${response.status}`);
    }

    return {
      success: true,
      provider: 'Evolution API',
      messageId: data?.key?.id || 'evo_msg',
      raw: data
    };
  }

  /**
   * Disparo via Meta Cloud API Oficial
   */
  async sendViaMeta(to, message, settings) {
    const phoneNumberId = settings.whatsapp_phone_number_id;
    const accessToken = settings.whatsapp_access_token;

    if (!phoneNumberId || !accessToken) {
      throw new Error('Credenciais da Meta Cloud API não configuradas.');
    }

    const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body: message }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Falha Meta API HTTP ${response.status}`);
    }

    return {
      success: true,
      provider: 'Meta Cloud API',
      messageId: data?.messages?.[0]?.id,
      raw: data
    };
  }

  /**
   * Verifica a conexão do provedor ativo
   */
  async verifyConnection() {
    const settings = db.getSettings();
    const provider = settings.whatsapp_provider || 'zapi';

    if (provider === 'zapi') {
      const { zapi_instance_id, zapi_token, zapi_client_token } = settings;
      if (!zapi_instance_id || !zapi_token) {
        return { valid: false, provider: 'Z-API', error: 'Instance ID e Token não configurados.' };
      }
      try {
        const headers = {};
        if (zapi_client_token) headers['Client-Token'] = zapi_client_token;
        const res = await fetch(`https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_token}/status`, { headers });
        const data = await res.json();
        const connected = data.connected === true || data.status === 'CONNECTED';
        return {
          valid: connected,
          provider: 'Z-API (QR Code)',
          status: connected ? 'Conectado (QR Code lido)' : 'Desconectado (Aguardando leitura do QR Code)',
          phone: data.phone || data.connectedPhone || null
        };
      } catch (err) {
        return { valid: false, provider: 'Z-API', error: err.message };
      }
    }

    if (provider === 'evolution') {
      const { evolution_base_url, evolution_instance_name, evolution_api_key } = settings;
      if (!evolution_base_url || !evolution_instance_name || !evolution_api_key) {
        return { valid: false, provider: 'Evolution API', error: 'URL, Instância e API Key não configurados.' };
      }
      try {
        const res = await fetch(`${evolution_base_url.replace(/\/$/, '')}/instance/connectionState/${evolution_instance_name}`, {
          headers: { 'apikey': evolution_api_key }
        });
        const data = await res.json();
        const state = data?.instance?.state || data?.state;
        const isConnected = state === 'open';
        return {
          valid: isConnected,
          provider: 'Evolution API (QR Code)',
          status: isConnected ? 'Conectado' : `Status: ${state || 'Desconectado'}`
        };
      } catch (err) {
        return { valid: false, provider: 'Evolution API', error: err.message };
      }
    }

    if (provider === 'meta') {
      const { whatsapp_phone_number_id, whatsapp_access_token } = settings;
      if (!whatsapp_phone_number_id || !whatsapp_access_token) {
        return { valid: false, provider: 'Meta Cloud API', error: 'Phone Number ID ou Token ausentes.' };
      }
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${whatsapp_phone_number_id}?fields=verified_name,display_phone_number`, {
          headers: { 'Authorization': `Bearer ${whatsapp_access_token}` }
        });
        const data = await res.json();
        return {
          valid: res.ok,
          provider: 'Meta Cloud API',
          display_phone_number: data.display_phone_number,
          verified_name: data.verified_name
        };
      } catch (err) {
        return { valid: false, provider: 'Meta Cloud API', error: err.message };
      }
    }

    return { valid: false, error: 'Provedor não suportado' };
  }

  /**
   * Constrói a mensagem padronizada B2 Energia Solar
   */
  buildNotificationMessage({ clientName, eventType, newStatus, cardUrl, dateFormatted }) {
    const isConcessionaria = eventType === 'CONCESSIONARIA_APROVADO';
    const headerEmoji = isConcessionaria ? '⚡' : '🔍';
    const title = isConcessionaria 
      ? 'PROJETO APROVADO NA CONCESSIONÁRIA' 
      : 'VISTORIA CONCLUÍDA COM SUCESSO';

    return [
      `*${headerEmoji} B2 ENERGIA SOLAR | NOTIFICAÇÃO*`,
      ``,
      `*Evento:* ${title}`,
      `*Cliente:* ${clientName}`,
      `*Status Atual:* ✅ ${newStatus}`,
      `*Data/Hora:* 📅 ${dateFormatted}`,
      ``,
      `🔗 *Acessar Cartão no Trello:*`,
      `${cardUrl}`,
      ``,
      `_Sistema automatizado de monitoramento B2 Energia Solar_`
    ].join('\n');
  }
}

export const unifiedWhatsAppService = new UnifiedWhatsAppService();
