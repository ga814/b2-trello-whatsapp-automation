import assert from 'assert';
import { db } from '../src/db.js';
import { trelloService } from '../src/services/trelloService.js';
import { metaWhatsAppService } from '../src/services/metaWhatsAppService.js';
import { notificationEngine } from '../src/services/notificationEngine.js';

console.log('--- INICIANDO TESTES DO MOTOR DE AUTOMAÇÃO B2 ENERGIA SOLAR ---');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. TESTE DE DETECÇÃO: CAMPO PERSONALIZADO CONCESSIONÁRIA -> APROVADO
runTest('Deve detectar alteração no Custom Field "Concessionária" para "Aprovado"', () => {
  const payload = {
    id: 'act_custom_field_123',
    type: 'updateCustomFieldItem',
    data: {
      card: {
        id: 'card_mirian_001',
        name: 'MIRIAN PAMPOLIM BATISTA',
        shortLink: 'Kbx8KP5s'
      },
      customField: {
        id: 'cf_concessionaria_id',
        name: 'Concessionária'
      },
      customFieldOption: {
        value: { text: 'Aprovado' }
      }
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed.eventType, 'CONCESSIONARIA_APROVADO');
  assert.strictEqual(parsed.clientName, 'MIRIAN PAMPOLIM BATISTA');
  assert.strictEqual(parsed.cardUrl, 'https://trello.com/c/Kbx8KP5s');
  assert.strictEqual(parsed.newStatus, 'Aprovado');
});

// 2. TESTE DE DETECÇÃO: CAMPO PERSONALIZADO VISTORIA -> CONCLUÍDO
runTest('Deve detectar alteração no Custom Field "Vistoria" para "Concluído"', () => {
  const payload = {
    id: 'act_custom_field_456',
    type: 'updateCustomFieldItem',
    data: {
      card: {
        id: 'card_ionara_002',
        name: 'IONARA ALVES DOS SANTOS',
        shortLink: 'WAYZHfzF'
      },
      customField: {
        id: 'cf_vistoria_id',
        name: 'Vistoria'
      },
      customFieldOption: {
        value: { text: 'Concluído' }
      }
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed.eventType, 'VISTORIA_CONCLUIDO');
  assert.strictEqual(parsed.clientName, 'IONARA ALVES DOS SANTOS');
  assert.strictEqual(parsed.newStatus, 'Concluído');
});

// 3. TESTE DE DETECÇÃO: MOVIMENTAÇÃO DE LISTA (CONCESSIONÁRIA -> APROVADO)
runTest('Deve detectar quando o cartão é movido para a lista "Aprovado"', () => {
  const payload = {
    id: 'act_list_move_789',
    type: 'updateCard',
    data: {
      card: {
        id: 'card_mauricio_003',
        name: 'MAURICIO GUATOLINI'
      },
      listBefore: { id: '6a67bd66996286fe4704c129', name: 'Concessionária' },
      listAfter: { id: '6a67bd6a674d11785aa8f844', name: 'Aprovado' }
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed.eventType, 'CONCESSIONARIA_APROVADO');
  assert.strictEqual(parsed.triggerSource, 'LIST_MOVE');
});

// 4. TESTE DE FORMATAÇÃO DE MENSAGEM DO WHATSAPP
runTest('Deve formatar a mensagem com identidade B2 Energia Solar, cliente, data e link do Trello', () => {
  const msg = metaWhatsAppService.buildNotificationMessage({
    clientName: 'MIRIAN PAMPOLIM BATISTA',
    eventType: 'CONCESSIONARIA_APROVADO',
    newStatus: 'Aprovado',
    cardUrl: 'https://trello.com/c/Kbx8KP5s',
    dateFormatted: '17/11/2026 às 12:45'
  });

  assert(msg.includes('B2 ENERGIA SOLAR'));
  assert(msg.includes('PROJETO APROVADO NA CONCESSIONÁRIA'));
  assert(msg.includes('MIRIAN PAMPOLIM BATISTA'));
  assert(msg.includes('https://trello.com/c/Kbx8KP5s'));
  assert(msg.includes('17/11/2026 às 12:45'));
});

// 5. TESTE DE DEDUPLICAÇÃO E IDEMPOTÊNCIA
runTest('Deve impedir disparos duplicados para a mesma ação de Webhook', () => {
  const uniqueActionId = `dedup_test_${Date.now()}`;
  
  assert.strictEqual(db.isActionProcessed(uniqueActionId), false);
  db.markActionProcessed(uniqueActionId);
  assert.strictEqual(db.isActionProcessed(uniqueActionId), true);
});

// 6. TESTE DE FORMATAÇÃO DE TELEFONE E.164
runTest('Deve converter telefone brasileiro para formato internacional E.164 com DDI 55', () => {
  assert.strictEqual(metaWhatsAppService.formatPhoneNumber('(27) 98893-4211'), '5527988934211');
  assert.strictEqual(metaWhatsAppService.formatPhoneNumber('27988934211'), '5527988934211');
  assert.strictEqual(metaWhatsAppService.formatPhoneNumber('5527988934211'), '5527988934211');
});

console.log(`\n🎉 TODOS OS ${passedTests} TESTES PASSARAM COM SUCESSO!`);
