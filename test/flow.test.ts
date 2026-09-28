import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bot, ScenarioState } from '@maxhub/max-bot-api';
import { careerScenario, needsSalaryCorrection } from '../src/dialog/flow.js';
import type { BotContext, BotSession, ProfileData, Step } from '../src/dialog/types.js';
import { isValidIdFormat, isValidInnFormat, missingPassportFields } from '../src/services/verification.js';
import { nearestCity } from '../src/services/geo.js';
import { dueReminder, reminderMessage, sendDueReminders } from '../src/reminders.js';

interface FakeCtxOptions {
  text?: string;
  callbackPayload?: string;
  location?: { latitude: number; longitude: number };
  messageId?: string;
  /** Сколько фото приложено к сообщению. */
  photos?: number;
}

interface Edit {
  id: string;
  text: string;
  hasKeyboard: boolean;
  keyboardText: string;
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const replies: string[] = [];
  const edits: Edit[] = [];
  const deleted: string[] = [];
  const notifications: string[] = [];
  let nextMid = 0;
  const isCallback = options.callbackPayload !== undefined;
  const ctx = {
    message: isCallback
      ? undefined
      : { body: { text: options.text ?? null, attachments: Array.from({ length: options.photos ?? 0 }, () => ({ type: 'image', payload: {} })) } },
    callback: isCallback ? { payload: options.callbackPayload } : undefined,
    location: options.location,
    chatId: 42,
    messageId: options.messageId,
    has: (filter: string) => (filter === 'message_callback' ? isCallback : !isCallback),
    reply: async (text: string) => {
      replies.push(text);
      nextMid += 1;
      return { body: { mid: `m${nextMid}` } } as never;
    },
    deleteMessage: async (id: string) => {
      deleted.push(id);
      return {} as never;
    },
    answerOnCallback: async (extra: { notification?: string }) => {
      notifications.push(extra.notification ?? '');
      return {} as never;
    },
    api: {
      editMessage: async (id: string, extra: { text?: string | null; attachments?: unknown[] }) => {
        const attachments = extra.attachments ?? [];
        edits.push({
          id,
          text: extra.text ?? '',
          hasKeyboard: attachments.length > 0,
          keyboardText: JSON.stringify(attachments),
        });
        return {} as never;
      },
    },
  };
  return { ctx: ctx as unknown as BotContext, replies, edits, deleted, notifications };
}

function fakeState(step: Step, data: ProfileData): ScenarioState<ProfileData, Step> {
  return { id: 'career-navigator', step, data };
}

async function runStep(step: Step, data: ProfileData, options: FakeCtxOptions) {
  const fake = fakeCtx(options);
  const result = await careerScenario.steps[step]({ ctx: fake.ctx, state: fakeState(step, data), data });
  return { result, ...fake };
}

async function runIntercept(step: Step, data: ProfileData, options: FakeCtxOptions) {
  const fake = fakeCtx(options);
  const result = await careerScenario.intercept?.({ ctx: fake.ctx, state: fakeState(step, data), data });
  return { result, ...fake };
}

function stepOf(result: unknown): Step | undefined {
  return (result as { step?: Step }).step;
}

function dataOf(result: unknown): Partial<ProfileData> {
  return (result as { data?: Partial<ProfileData> }).data ?? {};
}

// --- Имя и первый вопрос ----------------------------------------------------

test('имя: пустое — служебное сообщение и stay', async () => {
  const { result, replies } = await runStep('await_name', {}, { text: '   ' });
  assert.equal(result.type, 'stay');
  assert.ok(replies[0].includes('Имя не должно быть пустым'));
});

test('имя: задаётся вопрос об этапе обучения, его id запоминается', async () => {
  const { result, replies } = await runStep('await_name', {}, { text: 'Аня' });
  assert.equal(stepOf(result), 'await_study_stage');
  assert.deepEqual(dataOf(result), { name: 'Аня', currentQuestionId: 'm1' });
  assert.ok(replies[0].includes('Аня'));
});

test('приветствие: без слов про «первую работу»', async () => {
  const { replies } = await runStep('greet', {}, { text: '/start' });
  assert.ok(!replies[0].includes('первую работу'));
  assert.ok(!/трудоустр/i.test(replies[0]));
  assert.ok(replies[0].includes('прокачать карьеру'));
});

// --- Блоки и «Изменить» -----------------------------------------------------

test('ответ сворачивает вопрос в «Вопрос: ответ» с кнопкой «Изменить» и задаёт следующий', async () => {
  const { result, edits, replies } = await runStep('await_study_stage', { name: 'Аня', currentQuestionId: 'q1' }, { callbackPayload: 'uni_3_4' });
  assert.equal(stepOf(result), 'await_goal');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].id, 'q1');
  assert.ok(edits[0].text.startsWith('✅ **Этап обучения:**'));
  assert.ok(edits[0].keyboardText.includes('Изменить'));
  assert.ok(replies[0].includes('Что для тебя сейчас важнее'));
  assert.deepEqual(dataOf(result), {
    studyStage: 'uni_3_4',
    blockIds: { studyStage: 'q1' },
    lastAnswered: 'studyStage',
    currentQuestionId: 'm1',
  });
});

test('в свёрнутом блоке одна зелёная галочка — у варианта ответа своей нет', async () => {
  const { edits } = await runStep('await_experience', { goal: 'internship', currentQuestionId: 'q' }, { callbackPayload: 'exp_yes' });
  assert.ok(edits[0].text.startsWith('✅ **Опыт:**'));
  assert.equal(edits[0].text.split('✅').length - 1, 1);
});

test('«Изменить» остаётся только у последнего ответа — у предыдущего блока кнопка убирается', async () => {
  const { edits } = await runStep(
    'await_goal',
    { name: 'Аня', studyStage: 'uni_3_4', blockIds: { studyStage: 'q1' }, lastAnswered: 'studyStage', currentQuestionId: 'q2' },
    { callbackPayload: 'job' },
  );
  const previous = edits.find((e) => e.id === 'q1')!;
  const current = edits.find((e) => e.id === 'q2')!;
  assert.equal(previous.hasKeyboard, false);
  assert.ok(current.keyboardText.includes('Изменить'));
});

test('«Изменить»: текущий вопрос удаляется, предыдущий блок раскрывается обратно в вопрос', async () => {
  const data: ProfileData = { name: 'Аня', studyStage: 'uni_3_4', blockIds: { studyStage: 'q1' }, lastAnswered: 'studyStage', currentQuestionId: 'q2' };
  const { result, deleted, edits } = await runIntercept('await_goal', data, { callbackPayload: 'back', messageId: 'q1' });
  assert.deepEqual(deleted, ['q2']);
  assert.equal(edits[0].id, 'q1');
  assert.ok(edits[0].text.includes('На каком ты этапе'));
  assert.ok(edits[0].keyboardText.includes('Вуз, 1–2 курс'));
  assert.equal(stepOf(result), 'await_study_stage');
  assert.equal(dataOf(result).currentQuestionId, 'q1');
  assert.equal(dataOf(result).lastAnswered, undefined);
});

test('«Изменить» с чужого сообщения игнорируется', async () => {
  const data: ProfileData = { blockIds: { studyStage: 'q1' }, lastAnswered: 'studyStage', currentQuestionId: 'q2' };
  const { result, deleted } = await runIntercept('await_goal', data, { callbackPayload: 'back', messageId: 'old' });
  assert.equal(result!.type, 'stay');
  assert.deepEqual(deleted, []);
});

test('двойное нажатие или кнопка старого вопроса — молча игнорируются, без «выбери вариант»', async () => {
  const data: ProfileData = { currentQuestionId: 'q3' };
  const { result, replies, notifications } = await runIntercept('await_field', data, { callbackPayload: 'job', messageId: 'q2' });
  assert.equal(result!.type, 'stay');
  assert.deepEqual(replies, []);
  assert.deepEqual(notifications, ['']);
});

test('после «Изменить» и нового ответа удалённый вопрос приходит заново', async () => {
  const { result, replies, edits } = await runStep(
    'await_study_stage',
    { name: 'Аня', studyStage: 'uni_3_4', blockIds: { studyStage: 'q1' }, currentQuestionId: 'q1' },
    { callbackPayload: 'uni_1_2' },
  );
  assert.equal(stepOf(result), 'await_goal');
  assert.ok(edits[0].text.includes('Вуз, 1–2 курс'));
  assert.ok(replies[0].includes('Что для тебя сейчас важнее'));
});

// --- Ветки и порядок ---------------------------------------------------------

test('опыт: да/нет для стажировки, годы для работы', async () => {
  const internship = await runStep('await_field', { goal: 'internship', currentQuestionId: 'q' }, { callbackPayload: 'it' });
  assert.ok(internship.replies[0].includes('практический опыт'));
  const job = await runStep('await_field', { goal: 'job', currentQuestionId: 'q' }, { callbackPayload: 'it' });
  assert.ok(job.replies[0].includes('Сколько у тебя опыта'));
});

test('ответ из чужой ветки не принимается', async () => {
  const { result } = await runStep('await_experience', { goal: 'internship' }, { callbackPayload: 'exp_2_3' });
  assert.equal(result.type, 'stay');
});

test('после оплаты — «50% пройдено» с кнопкой «Продолжить», следующий вопрос не приходит', async () => {
  const { result, replies } = await runStep('await_salary', { goal: 'job', currentQuestionId: 'q' }, { callbackPayload: 'sal_50_80' });
  assert.equal(stepOf(result), 'await_midpoint');
  assert.equal(replies.length, 1);
  assert.ok(replies[0].includes('середине пути'));
  assert.equal(dataOf(result).currentQuestionId, 'm1');
});

test('«Продолжить»: сообщение «50%» удаляется, приходит вопрос про формат', async () => {
  const { result, replies, deleted } = await runStep('await_midpoint', { currentQuestionId: 'mid' }, { callbackPayload: 'continue' });
  assert.deepEqual(deleted, ['mid']);
  assert.ok(replies[0].includes('Какой формат'));
  assert.equal(stepOf(result), 'await_work_format');
  assert.equal(dataOf(result).midpointSent, true);
});

test('«50%» без нажатия «Продолжить» не пропускается', async () => {
  const { result } = await runStep('await_midpoint', { currentQuestionId: 'mid' }, { text: 'дальше' });
  assert.equal(result.type, 'stay');
});

test('после «Изменить» у оплаты «50%» не повторяется — сразу формат', async () => {
  const { result, replies } = await runStep('await_salary', { goal: 'job', currentQuestionId: 'q', midpointSent: true }, { callbackPayload: 'sal_50_80' });
  assert.equal(stepOf(result), 'await_work_format');
  assert.ok(replies[0].includes('Какой формат'));
});

test('порядок: формат → переезд → переработки → мотивация', async () => {
  const format = await runStep('await_work_format', { currentQuestionId: 'q' }, { callbackPayload: 'remote' });
  assert.equal(stepOf(format.result), 'await_relocation');
  const relocation = await runStep('await_relocation', { currentQuestionId: 'q' }, { callbackPayload: 'reloc_yes' });
  assert.equal(stepOf(relocation.result), 'await_overtime');
  const overtime = await runStep('await_overtime', { currentQuestionId: 'q' }, { callbackPayload: 'ready_sometimes' });
  assert.equal(stepOf(overtime.result), 'await_motivation');
});

// --- Мотивация: ровно два варианта ------------------------------------------

test('мотивация: первый выбор — галочка слева и счётчик 1 из 2', async () => {
  const { result, edits } = await runStep('await_motivation', { currentQuestionId: 'q' }, { callbackPayload: 'multi:growth' });
  assert.equal(result.type, 'stay');
  assert.deepEqual(dataOf(result).motivationDraft, ['growth']);
  assert.ok(edits[0].text.includes('1 из 2'));
  assert.ok(edits[0].keyboardText.includes('✅ 🚀 Карьерный рост'));
});

test('мотивация: повторное нажатие снимает выбор', async () => {
  const { result } = await runStep('await_motivation', { currentQuestionId: 'q', motivationDraft: ['growth'] }, { callbackPayload: 'multi:growth' });
  assert.deepEqual(dataOf(result).motivationDraft, []);
});

test('мотивация: второй выбор — блок сворачивается с «Изменить», анкета идёт дальше', async () => {
  const { result, edits } = await runStep(
    'await_motivation',
    { goal: 'internship', currentQuestionId: 'q', motivationDraft: ['growth'], blockIds: { overtime: 'o' }, lastAnswered: 'overtime' },
    { callbackPayload: 'multi:mentor' },
  );
  assert.equal(stepOf(result), 'await_verification');
  assert.deepEqual(dataOf(result).motivation, ['growth', 'mentor']);
  assert.equal(edits.find((e) => e.id === 'o')!.hasKeyboard, false);
  const block = edits.find((e) => e.id === 'q')!;
  assert.ok(block.keyboardText.includes('Изменить'));
  assert.equal(dataOf(result).lastAnswered, 'motivation');
  assert.ok(block.text.includes('Карьерный рост') && block.text.includes('Сильный наставник'));
});

// --- Корректировка завышенных ожиданий --------------------------------------

test('корректировка ЗП: условие срабатывания', () => {
  assert.equal(needsSalaryCorrection({ goal: 'job', experience: 'exp_0_1', salary: 'sal_80_150' }), true);
  assert.equal(needsSalaryCorrection({ goal: 'job', studyStage: 'uni_1_2', experience: 'exp_4_5', salary: 'sal_300p' }), true);
  assert.equal(needsSalaryCorrection({ goal: 'job', experience: 'exp_0_1', salary: 'sal_50_80' }), false);
  assert.equal(needsSalaryCorrection({ goal: 'job', experience: 'exp_2_3', salary: 'sal_150_300' }), false);
  assert.equal(needsSalaryCorrection({ goal: 'internship', experience: 'exp_no', salary: 'intern_paid' }), false);
});

test('корректировка ЗП: после мотивации показывается вопрос', async () => {
  const { result, replies } = await runStep(
    'await_motivation',
    { goal: 'job', experience: 'exp_0_1', salary: 'sal_150_300', currentQuestionId: 'q', motivationDraft: ['growth'] },
    { callbackPayload: 'multi:pay_now' },
  );
  assert.equal(stepOf(result), 'await_salary_correction');
  assert.ok(replies[0].includes('Последний вопрос'));
});

test('корректировка ЗП: «Оставить как есть» — сообщение корректировки удаляется, дальше верификация', async () => {
  const { result, deleted, edits } = await runStep('await_salary_correction', { goal: 'job', currentQuestionId: 'c' }, { callbackPayload: 'keep_salary' });
  assert.equal(stepOf(result), 'await_verification');
  assert.equal(dataOf(result).salaryRevision, 'keep');
  assert.deepEqual(deleted, ['c']);
  assert.equal(edits.length, 0);
});

test('корректировка ЗП: «Изменить ответ» — вилки до 150 000, меняется только блок зарплаты в середине', async () => {
  const opened = await runStep('await_salary_correction', { goal: 'job', currentQuestionId: 'c' }, { callbackPayload: 'fix_salary' });
  assert.equal(stepOf(opened.result), 'await_salary_fix');
  assert.ok(opened.edits[0].keyboardText.includes('80 000 – 150 000'));
  assert.ok(!opened.edits[0].keyboardText.includes('150 000 – 300 000'));

  const fixed = await runStep(
    'await_salary_fix',
    { goal: 'job', salary: 'sal_150_300', currentQuestionId: 'c', blockIds: { salary: 's' } },
    { callbackPayload: 'sal_50_80' },
  );
  assert.equal(stepOf(fixed.result), 'await_verification');
  assert.equal(dataOf(fixed.result).salary, 'sal_50_80');
  assert.equal(dataOf(fixed.result).salaryRevision, 'changed');
  assert.deepEqual(fixed.edits.map((e) => e.id), ['s']);
  assert.ok(fixed.edits[0].text.includes('50 000 – 80 000'));
  assert.deepEqual(fixed.deleted, ['c']);
});

test('верификация через Госуслуги — демо-проверка и вопрос о связи', async () => {
  const { result, replies } = await runStep('await_verification', { currentQuestionId: 'v' }, { callbackPayload: 'verify_gosuslugi' });
  assert.equal(stepOf(result), 'await_contact');
  assert.equal(dataOf(result).verified, true);
  assert.ok(replies.some((r) => r.includes('Проверяем')));
  assert.ok(replies.at(-1)!.includes('держать связь'));
});

test('Банк ID: сначала выбор банка в том же сообщении, затем вход и итог с названием банка', async () => {
  const chosen = await runStep('await_verification', { currentQuestionId: 'v' }, { callbackPayload: 'verify_bankid' });
  assert.equal(stepOf(chosen.result), 'await_bank');
  assert.equal(chosen.edits[0].id, 'v');
  assert.ok(chosen.edits[0].keyboardText.includes('Сбер ID'));
  assert.ok(chosen.edits[0].keyboardText.includes('Другой способ проверки'));

  const signedIn = await runStep('await_bank', { currentQuestionId: 'v', verificationMethod: 'verify_bankid' }, { callbackPayload: 'bank_tbank' });
  assert.equal(stepOf(signedIn.result), 'await_contact');
  assert.equal(dataOf(signedIn.result).bank, 'bank_tbank');
  assert.equal(dataOf(signedIn.result).verified, true);
  assert.ok(signedIn.replies.some((r) => r.includes('авторизация через Т-ID')));
  assert.ok(signedIn.edits.find((e) => e.id === 'v')!.text.includes('Банк ID — Т-ID'));
});

test('ручной ввод: вопрос о способе превращается в подсказку шага 1, итога пока нет', async () => {
  const { result, edits, replies } = await runStep('await_verification', { currentQuestionId: 'v' }, { callbackPayload: 'verify_manual' });
  assert.equal(stepOf(result), 'await_passport');
  assert.equal(replies.length, 0);
  assert.equal(edits[0].id, 'v');
  assert.ok(edits[0].text.includes('паспорт'));
  assert.ok(edits[0].keyboardText.includes('Другой способ проверки'));
  assert.ok(!/\d+ цифр/.test(edits[0].text));
});

test('паспорт текстом: нужны все данные, бот называет, чего не хватает', async () => {
  const partial = await runStep('await_passport', { currentQuestionId: 'v' }, { text: '4512 345678' });
  assert.equal(partial.result.type, 'stay');
  assert.ok(partial.replies[0].includes('код подразделения'));
  assert.ok(partial.replies[0].includes('дата выдачи и дата рождения'));

  const full = await runStep('await_passport', { currentQuestionId: 'v' }, { text: 'Серия и номер: 45 12 345678\nКем выдан: ГУ МВД России по г. Москве\nДата выдачи: 12.05.2020\nКод подразделения: 770-001\nДата рождения: 01.02.2004\nМесто рождения: гор. Москва\nАдрес регистрации: г. Москва, ул. Ленина, д. 1, кв. 2' });
  assert.equal(stepOf(full.result), 'await_inn');
  assert.equal(dataOf(full.result).passportProvided, true);
  assert.ok(full.edits[0].text.includes('один документ на выбор'));
});

test('шаг 2: ИНН или СНИЛС номером, неверный номер отклоняется', async () => {
  const bad = await runStep('await_inn', { passportProvided: true }, { text: '12345' });
  assert.equal(bad.result.type, 'stay');
  assert.ok(!/\d+ цифр/.test(bad.replies[0]));
  const good = await runStep('await_inn', { passportProvided: true }, { text: '123-456-789 01' });
  assert.equal(stepOf(good.result), 'await_contact');
  assert.equal(dataOf(good.result).verified, true);
});

test('«Другой способ проверки» возвращает к выбору Госуслуги / Банк ID / вручную', async () => {
  const { result, edits } = await runIntercept(
    'await_inn',
    { currentQuestionId: 'v', passportProvided: true, verificationMethod: 'verify_manual' },
    { callbackPayload: 'change_verification' },
  );
  assert.equal(stepOf(result), 'await_verification');
  assert.ok(edits[0].keyboardText.includes('Госуслуги'));
  assert.equal(dataOf(result).passportProvided, undefined);
});

test('если вопрос шага убрало напоминание, подсказка следующего шага приходит новым сообщением', async () => {
  const { result, replies } = await runStep('await_passport', {}, { photos: 2 });
  assert.equal(stepOf(result), 'await_inn');
  assert.ok(replies[0].includes('один документ на выбор'));
  assert.equal(dataOf(result).currentQuestionId, 'm1');
});

test('после ручной проверки подсказка удаляется, итог «✅ Верификация» выводится после данных', async () => {
  const { result, deleted, replies } = await runStep(
    'await_inn',
    { passportProvided: true, verificationMethod: 'verify_manual', manualMessageIds: ['passport-photo'], currentQuestionId: 'v' },
    { text: '1234567890', messageId: 'inn-text' },
  );
  assert.equal(stepOf(result), 'await_contact');
  for (const id of ['passport-photo', 'inn-text', 'v']) assert.ok(deleted.includes(id), id);
  const recapIndex = replies.findIndex((r) => r.startsWith('✅ **Верификация:**'));
  assert.ok(recapIndex >= 0);
  assert.ok(replies[recapIndex].includes('Паспорт + ИНН / СНИЛС'));
  assert.ok(replies[recapIndex + 1].includes('держать связь'));
  assert.ok(!replies.some((r) => r.includes('Профиль подтверждён')));
});

test('Госуслуги: сообщение о проверке удаляется, в чате остаётся только блок «✅ Верификация»', async () => {
  const { deleted, replies, edits } = await runStep('await_verification', { currentQuestionId: 'v' }, { callbackPayload: 'verify_gosuslugi' });
  assert.ok(deleted.includes('m1'));
  assert.ok(!replies.some((r) => r.includes('Профиль подтверждён')));
  assert.ok(edits.find((e) => e.id === 'v')!.text.startsWith('✅ **Верификация:**'));
});

test('паспорт по фото: после разворота 2–3 бот ждёт разворот 4–5', async () => {
  const first = await runStep('await_passport', {}, { photos: 1 });
  assert.equal(first.result.type, 'stay');
  assert.equal(dataOf(first.result).passportPhotos, 1);
  assert.ok(first.replies[0].includes('Разворот 2–3 получен') && first.replies[0].includes('разворота 4–5'));

  const second = await runStep('await_passport', { passportPhotos: 1 }, { photos: 1 });
  assert.equal(stepOf(second.result), 'await_inn');
  assert.equal(dataOf(second.result).passportProvided, true);
});

test('паспорт: оба разворота одним сообщением', async () => {
  const { result } = await runStep('await_passport', {}, { photos: 2 });
  assert.equal(stepOf(result), 'await_inn');
});

test('шаг 2: фото ИНН или СНИЛС принимается как есть (имитация)', async () => {
  const { result } = await runStep('await_inn', { passportProvided: true }, { photos: 1 });
  assert.equal(stepOf(result), 'await_contact');
});

test('связь → финал: сообщение «профиль готов» с кнопкой профиля', async () => {
  const { result, replies } = await runStep('await_contact', { name: 'Аня', currentQuestionId: 'k' }, { callbackPayload: 'contact_online' });
  assert.equal(stepOf(result), 'await_final_action');
  assert.ok(replies.at(-1)!.includes('профиль готов'));
  assert.ok(typeof dataOf(result).completedAt === 'number');
});

test('финал: кнопка открывает карточку профиля без пометок «демо»', async () => {
  const profile = await runStep('await_final_action', { name: 'Аня', goal: 'job', motivation: ['growth'], verified: true }, { callbackPayload: 'profile', messageId: 'fin' });
  assert.ok(profile.replies[0].includes('Мой профиль'));
  assert.ok(profile.replies[0].includes('с тобой свяжутся эксперты Федеральной службы по труду и занятости'));
  const finalEdit = profile.edits.find((e) => e.id === 'fin')!;
  assert.equal(finalEdit.hasKeyboard, false, 'кнопка профиля убрана с финального сообщения');
  assert.ok(profile.replies[0].includes('Аня'));
  assert.ok(!/демо/i.test(profile.replies[0]));
});

test('финальное сообщение без слова «демо»', async () => {
  const { replies } = await runStep('await_contact', { currentQuestionId: 'k' }, { callbackPayload: 'contact_offline' });
  assert.ok(replies.at(-1)!.includes('профиль готов'));
  assert.ok(!/демо/i.test(replies.at(-1)!));
});

// --- Напоминания ------------------------------------------------------------

const MIN = 60 * 1000;

test('напоминания: 30 минут и 2 часа для недозаполненной анкеты', () => {
  const t0 = 1_000_000;
  assert.equal(dueReminder('await_field', { lastActivityAt: t0 }, t0 + 29 * MIN), undefined);
  assert.equal(dueReminder('await_field', { lastActivityAt: t0 }, t0 + 30 * MIN), 'incomplete_30m');
  assert.equal(dueReminder('await_field', { lastActivityAt: t0, remindersSent: ['incomplete_30m'] }, t0 + 60 * MIN), undefined);
  assert.equal(dueReminder('await_field', { lastActivityAt: t0, remindersSent: ['incomplete_30m'] }, t0 + 120 * MIN), 'incomplete_2h');
  assert.equal(dueReminder('await_field', { lastActivityAt: t0, remindersSent: ['incomplete_30m', 'incomplete_2h'] }, t0 + 300 * MIN), undefined);
});

test('напоминания: после финала не приходят', () => {
  assert.equal(dueReminder('await_final_action', { lastActivityAt: 1 }, 1 + 300 * MIN), undefined);
});

test('второе напоминание без выдуманных цифр', () => {
  const message = reminderMessage('incomplete_2h');
  assert.ok(!message.text.includes('[X]'));
  assert.equal(message.payload, 'resume');
});

function fakeReminderEnv(data: ProfileData, step: Step) {
  const sessions = new Map<string, BotSession>([['7:42', { scenario: { id: 'career-navigator', step, data } }]]);
  const store = {
    keys: () => [...sessions.keys()],
    get: (k: string) => sessions.get(k),
    set: (k: string, v: BotSession) => void sessions.set(k, v),
    delete: (k: string) => void sessions.delete(k),
  };
  const sent: Array<{ chatId: number; text: string }> = [];
  const deletedIds: string[] = [];
  const bot = {
    api: {
      sendMessageToChat: async (chatId: number, text: string) => {
        sent.push({ chatId, text });
        return {};
      },
      deleteMessage: async (id: string) => {
        deletedIds.push(id);
        return {};
      },
    },
  };
  return { sessions, store, sent, deletedIds, bot: bot as unknown as Bot<BotContext> };
}

test('напоминание удаляет вопрос без ответа и запоминает, что отправлено', async () => {
  const env = fakeReminderEnv({ lastActivityAt: 1, currentQuestionId: 'q-open' }, 'await_field');
  await sendDueReminders(env.bot, env.store, 1 + 30 * MIN);
  assert.equal(env.sent.length, 1);
  assert.equal(env.sent[0].chatId, 42);
  assert.deepEqual(env.deletedIds, ['q-open']);
  const data = env.sessions.get('7:42')!.scenario!.data as ProfileData;
  assert.equal(data.currentQuestionId, undefined);
  assert.deepEqual(data.remindersSent, ['incomplete_30m']);
});

test('после финала напоминание не отправляется', async () => {
  const env = fakeReminderEnv({ lastActivityAt: 1, currentQuestionId: 'final' }, 'await_final_action');
  await sendDueReminders(env.bot, env.store, 1 + 300 * MIN);
  assert.equal(env.sent.length, 0);
  assert.deepEqual(env.deletedIds, []);
});

test('«Вернуться» после удалённого вопроса задаёт его заново', async () => {
  const { result, deleted, replies } = await runIntercept('await_field', {}, { callbackPayload: 'resume' });
  assert.deepEqual(deleted, []);
  assert.ok(replies[0].includes('Какая сфера'));
  assert.equal(dataOf(result).currentQuestionId, 'm1');
});

test('«Вернуться» из напоминания: старый вопрос удаляется и задаётся заново внизу чата', async () => {
  const { result, deleted, replies } = await runIntercept('await_field', { currentQuestionId: 'old' }, { callbackPayload: 'resume' });
  assert.deepEqual(deleted, ['old']);
  assert.ok(replies[0].includes('Какая сфера'));
  assert.equal(dataOf(result).currentQuestionId, 'm1');
});

// --- Город ------------------------------------------------------------------

test('город: быстрая кнопка', async () => {
  const { result, edits } = await runStep('await_city', { currentQuestionId: 'c' }, { callbackPayload: 'city:krd' });
  assert.equal(stepOf(result), 'await_field');
  assert.equal(dataOf(result).city, 'Краснодар');
  assert.ok(edits[0].text.includes('Краснодар'));
});

test('город: геопозиция рядом с известным городом', async () => {
  const { result, edits } = await runStep('await_city', { currentQuestionId: 'c' }, { location: { latitude: 55.75, longitude: 49.2 } });
  assert.equal(dataOf(result).city, 'Казань');
  assert.ok(edits[0].text.includes('по геопозиции'));
});

test('город: геопозиция далеко от всех городов — честно переспрашиваем', async () => {
  const { result, replies } = await runStep('await_city', { currentQuestionId: 'c' }, { location: { latitude: 43.1, longitude: 131.9 } });
  assert.equal(result.type, 'stay');
  assert.ok(replies[0].includes('Не смог определить город'));
});

test('город: текст принимается', async () => {
  const { result } = await runStep('await_city', { currentQuestionId: 'c' }, { text: 'Тула' });
  assert.equal(dataOf(result).city, 'Тула');
});

// --- Служебные сообщения -----------------------------------------------------

test('служебные сообщения: повторная ошибка заменяет предыдущую', async () => {
  const { result, deleted } = await runStep('await_study_stage', { serviceMessageIds: ['old-error'] }, { text: 'просто текст' });
  assert.equal(result.type, 'stay');
  assert.deepEqual(deleted, ['old-error']);
  assert.deepEqual(dataOf(result), { serviceMessageIds: ['m1'] });
});

test('служебные сообщения: правильный ответ убирает висящую ошибку', async () => {
  const { result, deleted } = await runStep('await_study_stage', { serviceMessageIds: ['old-error'], currentQuestionId: 'q' }, { callbackPayload: 'graduated' });
  assert.equal(stepOf(result), 'await_goal');
  assert.ok(deleted.includes('old-error'));
  assert.deepEqual(dataOf(result).serviceMessageIds, []);
});

// --- Сервисы ----------------------------------------------------------------

test('паспорт вручную: проверка полноты данных', () => {
  assert.deepEqual(missingPassportFields('Серия и номер: 45 12 345678\nКем выдан: ГУ МВД России по г. Москве\nДата выдачи: 12.05.2020\nКод подразделения: 770-001\nДата рождения: 01.02.2004\nМесто рождения: гор. Москва\nАдрес регистрации: г. Москва, ул. Ленина, д. 1, кв. 2'), []);
  assert.ok(missingPassportFields('').includes('серия и номер'));
  assert.ok(missingPassportFields('4512 345678, 770-001, 12.05.2020').includes('дата выдачи и дата рождения'));
});

test('форматы ИНН и СНИЛС', () => {
  assert.equal(isValidInnFormat('1234567890'), true);
  assert.equal(isValidInnFormat('123456789012'), true);
  assert.equal(isValidIdFormat('12345678901'), true);
  assert.equal(isValidIdFormat('123-456-789 01'), true);
  assert.equal(isValidIdFormat('12345'), false);
  assert.equal(isValidIdFormat('abcdefghijk'), false);
});

test('nearestCity: Краснодар в списке городов', () => {
  const { city, distanceKm } = nearestCity(45.04, 38.98);
  assert.equal(city.name, 'Краснодар');
  assert.ok(distanceKm < 10);
});

test('занятость: спрашиваем часы в неделю, в блоке — «Готов(а) уделять»', async () => {
  const { result, edits, replies } = await runStep(
    'await_employment',
    { name: 'Аня', goal: 'internship', currentQuestionId: 'q7' },
    { callbackPayload: 'hours_10_20' },
  );
  assert.equal(stepOf(result), 'await_salary');
  assert.equal(dataOf(result).employment, 'hours_10_20');
  assert.ok(edits.find((e) => e.id === 'q7')!.text.includes('Готов(а) уделять:** 🕐 10–20 часов'));
  assert.ok(replies.length === 1);
});

test('карточка профиля: эмодзи в начале каждой строки, мотивация с общим значком', async () => {
  const { profileCard } = await import('../src/dialog/flow.js');
  const card = profileCard({ name: 'Гера', goal: 'job', studyStage: 'uni_1_2', salary: 'sal_50_80', motivation: ['skills', 'high_income'], verified: true });
  assert.ok(card.includes('**Гера** · ✅ подтверждён'));
  assert.ok(card.includes('📘 **Этап обучения:** Вуз, 1–2 курс'));
  assert.ok(card.includes('📈 **Ожидания по зарплате:** 50 000 – 80 000 ₽ / мес'));
  assert.ok(card.includes('✨ **Мотивация:** Развитие новых навыков, Высокий доход на старте'));
});

test('стажировка: после формата работы вопрос о переезде пропускается', async () => {
  const intern = await runStep('await_work_format', { name: 'Аня', goal: 'internship', currentQuestionId: 'q9' }, { callbackPayload: 'remote' });
  assert.equal(stepOf(intern.result), 'await_overtime');
  const job = await runStep('await_work_format', { name: 'Аня', goal: 'job', currentQuestionId: 'q9' }, { callbackPayload: 'remote' });
  assert.equal(stepOf(job.result), 'await_relocation');
  const { profileCard } = await import('../src/dialog/flow.js');
  assert.ok(!profileCard({ name: 'Аня', goal: 'internship' }).includes('Переезд'));
});

test('«Изменить» у мотивации: раскрывается с отмеченными, третий вариант не добавляется', async () => {
  const data: ProfileData = { goal: 'internship', motivation: ['growth', 'mentor'], blockIds: { motivation: 'mb' }, lastAnswered: 'motivation', currentQuestionId: 'v' };
  const back = await runIntercept('await_verification', data, { callbackPayload: 'back', messageId: 'mb' });
  assert.equal(stepOf(back.result), 'await_motivation');
  assert.deepEqual(dataOf(back.result).motivationDraft, ['growth', 'mentor']);
  assert.deepEqual(back.deleted, ['v']);
  const third = await runStep('await_motivation', { ...data, motivationDraft: ['growth', 'mentor'], currentQuestionId: 'mb' }, { callbackPayload: 'multi:team' });
  assert.equal(third.result!.type, 'stay');
  assert.equal(dataOf(third.result).motivation, undefined);
});

test('эмодзи вариантов ответа не повторяются во всей анкете (и нет флагов и растений)', async () => {
  const s = await import('../src/dialog/script.js');
  const lists = [s.STUDY_STAGE_OPTIONS, s.GOAL_OPTIONS, s.FIELD_OPTIONS, s.INTERNSHIP_EXPERIENCE_OPTIONS, s.JOB_EXPERIENCE_OPTIONS,
    s.EMPLOYMENT_OPTIONS, s.INTERNSHIP_PAY_OPTIONS, s.WORK_FORMAT_OPTIONS, s.RELOCATION_OPTIONS, s.OVERTIME_OPTIONS,
    s.MOTIVATION_OPTIONS, s.CONTACT_OPTIONS];
  const icons = lists.flat().map((o) => o.label.split(' ')[0].replace('️', '')).filter((e) => /\p{Extended_Pictographic}/u.test(e));
  const dupes = icons.filter((e, i) => icons.indexOf(e) !== i);
  assert.deepEqual(dupes, []);
  assert.ok(!icons.some((e) => /[🏁🚩🌱🌿🌳🍀🌾]/u.test(e)));
});
