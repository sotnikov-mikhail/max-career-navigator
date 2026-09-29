import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScenarioState } from '@maxhub/max-bot-api';
import { careerScenario } from '../src/dialog/flow.js';
import type { BotContext, ProfileData, Step } from '../src/dialog/types.js';

/** Сквозной прогон ручной проверки: фото паспорта, ИНН фото/текст — как в чате, с общим списком сообщений. */
function makeChat() {
  const log: string[] = [];
  const alive = new Map<string, string>();
  let mid = 0;
  const reply = async (text: string) => {
    const id = `b${++mid}`;
    alive.set(id, text);
    log.push(`+${id} ${text.slice(0, 40).replace(/\n/g, ' ')}`);
    return { body: { mid: id } } as never;
  };
  return { log, alive, reply, next: () => `u${++mid}` };
}

type Send = { text?: string; photos?: number; callback?: string; messageId?: string };

async function drive(chat: ReturnType<typeof makeChat>, state: { step: Step; data: ProfileData }, send: Send) {
  const isCb = send.callback !== undefined;
  const userMid = isCb ? send.messageId : chat.next();
  const ctx = {
    message: isCb ? undefined : { body: { text: send.text ?? null, attachments: Array.from({ length: send.photos ?? 0 }, () => ({ type: 'image', payload: {} })) } },
    callback: isCb ? { payload: send.callback } : undefined,
    chatId: 42,
    messageId: userMid,
    has: (f: string) => (f === 'message_callback' ? isCb : !isCb),
    reply: chat.reply,
    deleteMessage: async (id: string) => {
      chat.log.push(`-${id}`);
      chat.alive.delete(id);
      return { success: true } as never;
    },
    answerOnCallback: async () => ({}) as never,
    api: {
      editMessage: async (id: string, extra: { text?: string | null }) => {
        chat.log.push(`~${id} ${(extra.text ?? '').slice(0, 40).replace(/\n/g, ' ')}`);
        return {} as never;
      },
    },
  } as unknown as BotContext;
  const st = { id: 'career-navigator', step: state.step, data: state.data } as ScenarioState<ProfileData, Step>;
  const input = { ctx, state: st, data: state.data };
  const result = (await careerScenario.intercept?.(input)) ?? (await careerScenario.steps[state.step](input));
  const r = result as { type: string; step?: Step; data?: Partial<ProfileData> };
  return { step: (r.type === 'goto' ? r.step! : state.step) as Step, data: { ...state.data, ...(r.data ?? {}) } as ProfileData };
}

test('ручная проверка целиком: паспорт двумя фото, затем ИНН фото — доходит до выбора связи', async () => {
  const chat = makeChat();
  let s = { step: 'await_verification' as Step, data: { name: 'Аня', currentQuestionId: 'v' } as ProfileData };
  s = await drive(chat, s, { callback: 'verify_manual', messageId: 'v' });
  assert.equal(s.step, 'await_passport');
  s = await drive(chat, s, { photos: 1 });
  assert.equal(s.step, 'await_passport');
  const before2 = chat.log.length;
  s = await drive(chat, s, { photos: 1 });
  assert.equal(s.step, 'await_inn', chat.log.join('\n'));
  const step2 = chat.log.slice(before2);
  assert.ok(step2.some((l) => l.startsWith('+b') && l.includes('один документ на выбор')), 'подсказка шага 2 — новое сообщение внизу');
  assert.ok(!step2.some((l) => l.startsWith('~')), 'ничего не редактируется выше фото');

  const before3 = chat.log.length;
  s = await drive(chat, s, { photos: 1 });
  assert.equal(s.step, 'await_contact', chat.log.join('\n'));
  const step3 = chat.log.slice(before3);
  const firstDelete = step3.findIndex((l) => l.startsWith('-'));
  const contactAsked = step3.findIndex((l) => l.includes('данные подтверждены'));
  assert.ok(contactAsked >= 0, 'вопрос о связи пришёл');
  assert.ok(step3.findIndex((l) => l.includes('Проверяем')) < contactAsked, '«Проверяем» раньше вопроса о связи');
  const firstUserCleanup = step3.findIndex((l, i) => l.startsWith('-') && i > step3.findIndex((x) => x.includes('Проверяем')) + 1);
  assert.ok(firstUserCleanup === -1 || firstUserCleanup > contactAsked, 'уборка сообщений — после того, как показан результат');
  assert.ok(firstDelete === -1 || step3.findIndex((l) => l.includes('Проверяем')) < firstDelete + 1);
});

test('ручная проверка: паспорт одним сообщением с двумя фото, ИНН текстом', async () => {
  const chat = makeChat();
  let s = { step: 'await_verification' as Step, data: { name: 'Аня', currentQuestionId: 'v' } as ProfileData };
  s = await drive(chat, s, { callback: 'verify_manual', messageId: 'v' });
  s = await drive(chat, s, { photos: 2 });
  assert.equal(s.step, 'await_inn');
  s = await drive(chat, s, { text: '123-456-789 01' });
  assert.equal(s.step, 'await_contact');
});
