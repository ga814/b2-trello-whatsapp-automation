import { db } from '../db.js';

/**
 * Serviço de Integração com a Meta WhatsApp Cloud API Oficial
 */
export class MetaWhatsAppService {
  constructor() {
    this.apiBaseUrl = 'https://graph.facebook.com/v21.0';
  }

  /**
   * Obtém credenciais ativas do banco ou variáveis de ambiente
   */
  getCredentials() {
    const settings = db.getSettings();
    return {
      phoneNumberId: settings.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: settings.whatsapp_waba_id || process.env.WHATSAPP_WABA_ID,
      accessToken: settings.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN
    };
  }

  /**
   * Formata número de telefone para o padrão E.164 internacional exigido pela Meta
   * Ex: (27) 98893-4211 -> 5527988934211
   */
  formatPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/\D/g, '');
    // Se não tiver o DDI 55 (Brasil) e tiver 10 ou 11 dígitos, acrescenta 55
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = `55${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Envia mensagem de texto formatada para um destinatário
   */
  async sendMessage(toPhone, messageText) {
    const { phoneNumberId, accessToken } = this.getCredentials();

    if (!phoneNumberId || !accessToken) {
      throw new Error('Credenciais da Meta WhatsApp Cloud API não configuradas (Phone Number ID ou Access Token ausentes).');
    }

    const formattedTo = this.formatPhoneNumber(toPhone);
    const endpoint = `${this.apiBaseUrl}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'text',
      text: {
        preview_url: true,
        body: messageText
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Falha HTTP ${response.status}`;
        const errorDetails = data?.error?.error_data?.details || data?.error?.type || '';
        throw new Error(`[Meta WhatsApp API Error] ${errorMsg} (${errorDetails})`);
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
        raw: data
      };
    } catch (err) {
      console.error(`[WhatsApp Error] Falha ao enviar para ${formattedTo}:`, err.message);
      throw err;
    }
  }

  /**
   * Valida credenciais da Meta enviando uma consulta de status do número
   */
  async verifyConnection() {
    const { phoneNumberId, accessToken } = this.getCredentials();

    if (!phoneNumberId || !accessToken) {
      return {
        valid: false,
        message: 'Phone Number ID ou Access Token não configurados.'
      };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          valid: false,
          error: data?.error?.message || 'Token ou Phone Number ID inválido na Meta.'
        };
      }

      return {
        valid: true,
        verified_name: data.verified_name || 'B2 Energia Solar',
        display_phone_number: data.display_phone_number,
        quality_rating: data.quality_rating
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message
      };
    }
  }

  /**
   * Formata a mensagem padrão com a identidade visual da B2 Energia Solar
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

export const metaWhatsAppService = new MetaWhatsAppService();
