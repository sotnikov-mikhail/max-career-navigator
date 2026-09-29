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

/** Нажатие кнопки на текущем вопросе (id сообщения берём из состояния — как настоящий callback). */
const press = (chat: ReturnType<typeof makeChat>, s: { step: Step; data: ProfileData }, id: string) =>
  drive(chat, s, { callback: id, messageId: s.data.currentQuestionId });

test('вся анкета «Работа»: приветствие → … → корректировка → Госуслуги → связь → профиль → «Изменить» у связи', async () => {
  const chat = makeChat();
  let s = { step: 'greet' as Step, data: {} as ProfileData };
  s = await drive(chat, s, {});
  assert.equal(s.step, 'await_name');
  s = await drive(chat, s, { text: 'Аня' });
  assert.equal(s.step, 'await_consent');
  assert.equal(s.data.name, undefined, 'до согласия имя не сохранено');
  s = await press(chat, s, 'consent_yes');
  assert.equal(s.step, 'await_study_stage');
  assert.equal(s.data.name, 'Аня');
  for (const [id, next] of [
    ['uni_1_2', 'await_goal'], ['job', 'await_city'], ['city:msk', 'await_field'], ['it', 'await_experience'],
    ['exp_0_1', 'await_employment'], ['hours_10_20', 'await_salary'], ['sal_150_300', 'await_midpoint'], ['continue', 'await_work_format'],
    ['remote', 'await_relocation'], ['reloc_no', 'await_overtime'], ['ready_100', 'await_motivation'],
  ] as const) {
    s = await press(chat, s, id);
    assert.equal(s.step, next, `после «${id}»`);
  }
  s = await press(chat, s, 'multi:growth');
  s = await press(chat, s, 'multi:mentor');
  assert.equal(s.step, 'await_salary_correction');
  s = await press(chat, s, 'fix_salary');
  assert.equal(s.step, 'await_salary_fix');
  s = await press(chat, s, 'sal_50_80');
  assert.equal(s.step, 'await_verification');
  s = await press(chat, s, 'verify_gosuslugi');
  assert.equal(s.step, 'await_contact');
  s = await press(chat, s, 'contact_online');
  assert.equal(s.step, 'await_final_action');
  assert.equal(s.data.verified, true);
  assert.equal(typeof s.data.consentAt, 'number');
  assert.equal(s.data.salary, 'sal_50_80');

  const log = chat.log.join('\n');
  assert.ok(log.indexOf('Проверяем') < log.lastIndexOf('~'), '«Проверяем» раньше итоговых строк');
});

test('вся анкета «Стажировка»: без вопроса о переезде, ручная проверка, «Изменить» у мотивации', async () => {
  const chat = makeChat();
  let s = { step: 'greet' as Step, data: {} as ProfileData };
  s = await drive(chat, s, {});
  s = await drive(chat, s, { text: 'Гера' });
  s = await press(chat, s, 'consent_yes');
  for (const [id, next] of [
    ['college', 'await_goal'], ['internship', 'await_city'], ['city:kzn', 'await_field'], ['design', 'await_experience'],
    ['exp_no', 'await_employment'], ['hours_lt_10', 'await_salary'], ['intern_paid', 'await_midpoint'], ['continue', 'await_work_format'],
    ['hybrid', 'await_overtime'],
  ] as const) {
    s = await press(chat, s, id);
    assert.equal(s.step, next, `после «${id}»`);
  }
  s = await press(chat, s, 'strict_schedule');
  s = await press(chat, s, 'multi:team');
  s = await press(chat, s, 'multi:skills');
  assert.equal(s.step, 'await_verification');
  assert.equal(s.data.lastAnswered, 'motivation', 'у мотивации есть «Изменить»');
  s = await press(chat, s, 'verify_manual');
  s = await drive(chat, s, { photos: 2 });
  assert.equal(s.step, 'await_inn');
  s = await drive(chat, s, { text: '000-000-000 00' });
  assert.equal(s.step, 'await_contact');
  s = await press(chat, s, 'contact_offline');
  assert.equal(s.step, 'await_final_action');
  assert.equal(s.data.relocation, undefined, 'у стажировки переезд не спрашивали');
  assert.equal(s.data.passportProvided, true);
});

test('город текстом: буквы принимаются, мусор — нет; напоминаний после отправки профиля нет; служебные события таймер не сбрасывают', async () => {
  const { isValidCity } = await import('../src/dialog/flow.js');
  for (const ok of ['Тверь', 'Ростов-на-Дону', 'Нижний Новгород', 'г. Омск', "Д'Артаньян-Сити"]) assert.ok(isValidCity(ok), ok);
  for (const bad of ['1', 'asdf 123', '12345', '😀', 'Я'.repeat(41), '']) assert.ok(!isValidCity(bad), bad);
  const { dueReminder } = await import('../src/reminders.js');
  assert.equal(dueReminder('await_contact', { lastActivityAt: 1, completedAt: 5 }, 1 + 300 * 60_000), undefined);
  assert.equal(dueReminder('await_contact', { lastActivityAt: 1 }, 1 + 300 * 60_000), 'incomplete_2h');
  const { markActivity } = await import('../src/start.js');
  const same = { lastActivityAt: 1, remindersSent: ['incomplete_30m'] };
  const muted = markActivity({ updateType: 'dialog_muted', chatId: 1 } as unknown as BotContext, same, 999);
  assert.equal(muted.lastActivityAt, 1, 'mute не сбрасывает таймер');
  const started = markActivity({ updateType: 'bot_started', chatId: 1 } as unknown as BotContext, same, 999);
  assert.equal(started.lastActivityAt, 999, '«Начать» — активность');
});
