import assert from 'assert';
import { db } from '../src/db.js';
import { trelloService } from '../src/services/trelloService.js';
import { unifiedWhatsAppService } from '../src/services/unifiedWhatsAppService.js';

console.log('--- INICIANDO TESTES DO MOTOR DE AUTOMAÇÃO B2 ENERGIA SOLAR (QR CODE + TRELLO) ---');

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

// 1. TESTE DE DETECÇÃO: MOVIMENTAÇÃO DE CONCESSIONÁRIA PARA VISTORIA
runTest('Deve detectar quando o cartão é movido de Concessionária para Vistoria', () => {
  const payload = {
    id: 'act_list_move_vistoria',
    type: 'updateCard',
    data: {
      card: {
        id: 'card_vistoria_001',
        name: 'LUCIA CIRINO PEREIRA',
        shortLink: 's5vX8OZ5'
      },
      listBefore: { id: '6a67bd66996286fe4704c129', name: 'Concessionária' },
      listAfter: { id: '6a67bd6fc49d256a4dbb25df', name: 'Vistoria' }
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed.eventType, 'VISTORIA_SOLICITADA');
  assert.strictEqual(parsed.clientName, 'LUCIA CIRINO PEREIRA');
  assert.strictEqual(parsed.cardUrl, 'https://trello.com/c/s5vX8OZ5');
});

// 2. TESTE DE DETECÇÃO: MOVIMENTAÇÃO DE VISTORIA PARA CONCLUÍDOS
runTest('Deve detectar quando o cartão é movido de Vistoria para Concluídos', () => {
  const payload = {
    id: 'act_list_move_concluido',
    type: 'updateCard',
    data: {
      card: {
        id: 'card_concluido_002',
        name: 'LUCIA CIRINO PEREIRA'
      },
      listBefore: { id: '6a67bd6fc49d256a4dbb25df', name: 'Vistoria' },
      listAfter: { id: '6a68a86d2b94cf74712ee849', name: '🎉 Concluídos' }
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed.eventType, 'VISTORIA_CONCLUIDO');
});

// 3. TESTE DE BLOQUEIO: COMENTÁRIOS E OUTRAS LISTAS NÃO DISPARAM
runTest('NÃO deve disparar notificação em comentários de cartões (commentCard)', () => {
  const payload = {
    id: 'act_comment_test',
    type: 'commentCard',
    data: {
      card: { id: 'card_003', name: 'TESTE CLIENTE' },
      text: 'Nota de Atendimento: 045006522737'
    }
  };

  const parsed = trelloService.parseWebhookAction(payload);
  assert.strictEqual(parsed, null);
});

// 4. TESTE DE BLOQUEIO: MOVIMENTAÇÃO PARA OUTRAS LISTAS (EX: APROVADO OU NOVOS PROJETOS) NÃO DISPARAM
runTest('NÃO deve disparar quando movido para Aprovado ou outras listas', () => {
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
  assert.strictEqual(parsed, null);
});

// 3. TESTE DE FORMATAÇÃO DE MENSAGEM
runTest('Deve formatar a mensagem com a identidade B2 Energia Solar, cliente, data e link do Trello', () => {
  const msg = unifiedWhatsAppService.buildNotificationMessage({
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

// 4. TESTE DE DEDUPLICAÇÃO E IDEMPOTÊNCIA
runTest('Deve impedir disparos duplicados para a mesma ação de Webhook', () => {
  const uniqueActionId = `dedup_test_${Date.now()}`;
  assert.strictEqual(db.isActionProcessed(uniqueActionId), false);
  db.markActionProcessed(uniqueActionId);
  assert.strictEqual(db.isActionProcessed(uniqueActionId), true);
});

// 5. TESTE DE FORMATAÇÃO DE TELEFONE E.164
runTest('Deve converter telefone brasileiro para formato internacional E.164 com DDI 55', () => {
  assert.strictEqual(unifiedWhatsAppService.formatPhoneNumber('(27) 98893-4211'), '5527988934211');
  assert.strictEqual(unifiedWhatsAppService.formatPhoneNumber('27988934211'), '5527988934211');
  assert.strictEqual(unifiedWhatsAppService.formatPhoneNumber('5527988934211'), '5527988934211');
});

console.log(`\n🎉 TODOS OS ${passedTests} TESTES PASSARAM COM SUCESSO!`);
