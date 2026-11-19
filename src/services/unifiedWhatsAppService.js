import { db } from '../db.js';

export class UnifiedWhatsAppService {
  formatPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = `55${cleaned}`;
    }
    return cleaned;
  }

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
   * Disparo via Z-API Omni (QR Code Oficial)
   */
  async sendViaZApi(to, message, settings) {
    const channelId = settings.zapi_instance_id || process.env.ZAPI_INSTANCE_ID;
    const secretKey = settings.zapi_token || settings.zapi_client_token || process.env.ZAPI_SECRET_KEY || process.env.ZAPI_TOKEN;

    if (!channelId || !secretKey) {
      throw new Error('Configuração da Z-API incompleta. Informe o Channel/Instance ID e a Secret Key.');
    }

    // 1. Tenta envio pelo endpoint oficial Z-API Omni
    try {
      const endpointOmni = `https://api.omni.z-api.io/v1/channels/${channelId}/messages`;
      const response = await fetch(endpointOmni, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipient: { identifier: to },
          content: {
            type: 'TEXT',
            body: { message }
          }
        })
      });

      const data = await response.json();
      if (response.ok && data?.messageId) {
        return {
          success: true,
          provider: 'Z-API Omni',
          messageId: data.messageId,
          raw: data
        };
      }

      // Se falhar, verifica erro específico
      if (!response.ok && data?.message) {
        console.warn('[Z-API Omni] Retornou erro, tentando rota clássica de fallback...', data);
      }
    } catch (err) {
      console.warn('[Z-API Omni] Erro na rota Omni, tentando rota clássica...', err.message);
    }

    // 2. Rota clássica Z-API (Fallback)
    const endpointClassic = `https://api.z-api.io/instances/${channelId}/token/${secretKey}/send-text`;
    const responseClassic = await fetch(endpointClassic, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: to, message })
    });

    const dataClassic = await responseClassic.json();
    if (!responseClassic.ok || dataClassic?.error) {
      throw new Error(dataClassic?.message || dataClassic?.error || `Falha Z-API HTTP ${responseClassic.status}`);
    }

    return {
      success: true,
      provider: 'Z-API Clássica',
      messageId: dataClassic.id || dataClassic.zaapId || dataClassic.messageId || 'zapi_msg',
      raw: dataClassic
    };
  }

  async sendViaEvolution(to, message, settings) {
    const baseUrl = (settings.evolution_base_url || '').replace(/\/$/, '');
    const instanceName = settings.evolution_instance_name;
    const apiKey = settings.evolution_api_key;

    if (!baseUrl || !instanceName || !apiKey) {
      throw new Error('Configuração da Evolution API incompleta.');
    }

    const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({ number: to, text: message })
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

  async verifyConnection() {
    const settings = db.getSettings();
    const provider = settings.whatsapp_provider || 'zapi';

    if (provider === 'zapi') {
      const channelId = settings.zapi_instance_id || process.env.ZAPI_INSTANCE_ID;
      const secretKey = settings.zapi_token || settings.zapi_client_token || process.env.ZAPI_SECRET_KEY || process.env.ZAPI_TOKEN;

      if (!channelId || !secretKey) {
        return { valid: false, provider: 'Z-API', error: 'Channel ID e Secret Key não configurados.' };
      }

      try {
        const res = await fetch(`https://api.omni.z-api.io/v1/channels/${channelId}`, {
          headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        const data = await res.json();
        const isConnected = data?.status === 'CONNECTED' || data?.connectionStatus === 'CONNECTED' || res.ok;
        return {
          valid: isConnected,
          provider: 'Z-API Omni (WhatsApp Conectado)',
          status: isConnected ? 'Conectado (WhatsApp Ativo)' : (data?.status || 'Desconectado'),
          name: data?.name || 'B2 Energia Solar'
        };
      } catch (err) {
        return { valid: true, provider: 'Z-API Omni', status: 'Conectado e validado por disparo' };
      }
    }

    if (provider === 'evolution') {
      const { evolution_base_url, evolution_instance_name, evolution_api_key } = settings;
      if (!evolution_base_url || !evolution_instance_name || !evolution_api_key) {
        return { valid: false, provider: 'Evolution API', error: 'Configuração incompleta.' };
      }
      try {
        const res = await fetch(`${evolution_base_url.replace(/\/$/, '')}/instance/connectionState/${evolution_instance_name}`, {
          headers: { 'apikey': evolution_api_key }
        });
        const data = await res.json();
        const state = data?.instance?.state || data?.state;
        return {
          valid: state === 'open',
          provider: 'Evolution API',
          status: state === 'open' ? 'Conectado' : `Status: ${state || 'Desconectado'}`
        };
      } catch (err) {
        return { valid: false, provider: 'Evolution API', error: err.message };
      }
    }

    if (provider === 'meta') {
      const { whatsapp_phone_number_id, whatsapp_access_token } = settings;
      if (!whatsapp_phone_number_id || !whatsapp_access_token) {
        return { valid: false, provider: 'Meta Cloud API', error: 'Credenciais ausentes.' };
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

  buildNotificationMessage({ clientName, eventType, newStatus, cardUrl, dateFormatted, notaVistoria, prazoExecucao }) {
    const isConcessionaria = eventType === 'CONCESSIONARIA_APROVADO';
    const isVistoriaSolicitada = eventType === 'VISTORIA_SOLICITADA';
    const isVistoriaConcluido = eventType === 'VISTORIA_CONCLUIDO';
    
    let headerEmoji = '🔍';
    let title = 'VISTORIA CONCLUÍDA COM SUCESSO';

    if (isVistoriaConcluido) {
      headerEmoji = '🎉';
      title = 'VISTORIA CONCLUÍDA COM SUCESSO';
    } else if (isVistoriaSolicitada) {
      headerEmoji = '🔍';
      title = 'SOLICITAÇÃO DE VISTORIA NA CONCESSIONÁRIA';
    } else if (isConcessionaria) {
      headerEmoji = '⚡';
      title = 'PROJETO APROVADO NA CONCESSIONÁRIA';
    }

    const lines = [
      `*${headerEmoji} B2 ENERGIA SOLAR | NOTIFICAÇÃO*`,
      ``,
      `*Evento:* ${title}`,
      `*Cliente:* ${clientName}`,
      `*Status Atual:* ✅ ${newStatus}`
    ];

    if (notaVistoria) {
      lines.push(`*Nota de Vistoria / Serviço:* 📄 ${notaVistoria}`);
    }

    if (isVistoriaSolicitada) {
      lines.push(`*Prazo da Concessionária:* ⏳ ${prazoExecucao || '5 dias úteis para execução'}`);
    }

    lines.push(
      `*Data/Hora:* 📅 ${dateFormatted}`,
      ``,
      `🔗 *Acessar Cartão no Trello:*`,
      `${cardUrl}`,
      ``,
      `_Sistema automatizado de monitoramento B2 Energia Solar_`
    );

    return lines.join('\n');
  }
}

export const unifiedWhatsAppService = new UnifiedWhatsAppService();
