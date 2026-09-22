import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScenarioState } from '@maxhub/max-bot-api';
import { careerScenario } from '../src/dialog/flow.js';
import type { BotContext, ProfileData, Step } from '../src/dialog/types.js';
import { isValidInnFormat } from '../src/services/verification.js';
import { matchVacancies } from '../src/services/matching.js';
import { nearestCity } from '../src/services/geo.js';
import { isSalaryInflated } from '../src/dialog/script.js';

interface FakeCtxOptions {
  text?: string;
  callbackPayload?: string;
  location?: { latitude: number; longitude: number };
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const replies: string[] = [];
  const edits: string[] = [];
  const deleted: string[] = [];
  const answeredCallbacks: number[] = [];
  let nextMid = 0;
  const isCallback = options.callbackPayload !== undefined;
  const ctx = {
    message: isCallback ? undefined : { body: { text: options.text ?? null } },
    callback: isCallback ? { payload: options.callbackPayload } : undefined,
    location: options.location,
    chatId: 42,
    messageId: 'clicked',
    has: (filter: string) => (filter === 'message_callback' ? isCallback : !isCallback),
    reply: async (text: string) => {
      replies.push(text);
      nextMid += 1;
      return { body: { mid: `m${nextMid}` } } as never;
    },
    editMessage: async (extra: { text?: string | null }) => {
      edits.push(extra.text ?? '');
      return {} as never;
    },
    deleteMessage: async (id: string) => {
      deleted.push(id);
      return {} as never;
    },
    sendAction: async () => ({}) as never,
    answerOnCallback: async () => {
      answeredCallbacks.push(1);
      return {} as never;
    },
    api: {
      editMessage: async (_id: string, extra: { text?: string | null }) => {
        edits.push(extra.text ?? '');
        return {} as never;
      },
    },
  };
  return { ctx: ctx as unknown as BotContext, replies, edits, deleted, answeredCallbacks };
}

function fakeState(step: Step): ScenarioState<ProfileData, Step> {
  return { id: 'career-navigator', step, data: {} };
}

async function runStep(step: Step, data: ProfileData, ctxOptions: FakeCtxOptions) {
  const { ctx, replies, edits, deleted } = fakeCtx(ctxOptions);
  const stepFn = careerScenario.steps[step];
  const transitionResult = await stepFn({ ctx, state: fakeState(step), data });
  return { transitionResult, replies, edits, deleted, ctx };
}

async function runIntercept(step: Step, data: ProfileData, ctxOptions: FakeCtxOptions) {
  const { ctx, replies, edits, deleted } = fakeCtx(ctxOptions);
  const transitionResult = await careerScenario.intercept?.({ ctx, state: fakeState(step), data });
  return { transitionResult, replies, edits, deleted, ctx };
}

function transitionData(result: unknown): Partial<ProfileData> | undefined {
  return (result as { data?: Partial<ProfileData> }).data;
}

test('await_name: пустое имя переспрашивает (stay)', async () => {
  const { transitionResult } = await runStep('await_name', {}, { text: '   ' });
  assert.equal(transitionResult.type, 'stay');
});

test('await_name: валидное имя переходит к study_stage и сохраняет данные', async () => {
  const { transitionResult, replies } = await runStep('await_name', {}, { text: 'Аня' });
  assert.equal(transitionResult.type, 'goto');
  assert.equal((transitionResult as { step: Step }).step, 'await_study_stage');
  assert.deepEqual((transitionResult as { data?: Partial<ProfileData> }).data, { name: 'Аня' });
  assert.equal(replies.length, 1);
});

test('await_study_stage: неизвестный payload -> stay, известный -> goto await_goal', async () => {
  const invalid = await runStep('await_study_stage', {}, { callbackPayload: 'not-a-real-option' });
  assert.equal(invalid.transitionResult.type, 'stay');

  const valid = await runStep('await_study_stage', {}, { callbackPayload: 'uni_3_4' });
  assert.equal(valid.transitionResult.type, 'goto');
  assert.equal((valid.transitionResult as { step: Step }).step, 'await_goal');
  assert.deepEqual((valid.transitionResult as { data?: Partial<ProfileData> }).data, { studyStage: 'uni_3_4' });
});

test('await_study_stage: валидный ответ схлопывает вопрос (editMessage) с кнопкой «Изменить»', async () => {
  const { edits } = await runStep('await_study_stage', {}, { callbackPayload: 'uni_3_4' });
  assert.equal(edits.length, 1);
  assert.ok(edits[0].includes('Этап обучения'));
  assert.ok(edits[0].includes('Вуз, 3–4 курс'));
});

test('ветки: вопрос об опыте — да/нет для стажировки, годы для работы', async () => {
  const internship = await runStep('await_field', { goal: 'internship' }, { callbackPayload: 'it' });
  assert.equal((internship.transitionResult as { step: Step }).step, 'await_experience');
  assert.ok(internship.replies[0].includes('Есть ли у тебя уже опыт'));

  const job = await runStep('await_field', { goal: 'job' }, { callbackPayload: 'it' });
  assert.ok(job.replies[0].includes('Сколько у тебя опыта'));
});

test('ветки: ответ из чужой ветки не принимается', async () => {
  const { transitionResult } = await runStep('await_experience', { goal: 'internship' }, { callbackPayload: 'exp_2_3' });
  assert.equal(transitionResult.type, 'stay');
});

test('ветки: оплата — оплачиваемая/нет для стажировки, вилка для работы', async () => {
  const internship = await runStep('await_salary', { goal: 'internship' }, { callbackPayload: 'intern_unpaid' });
  assert.deepEqual(transitionData(internship.transitionResult), { salary: 'intern_unpaid' });

  const job = await runStep('await_salary', { goal: 'job' }, { callbackPayload: 'sal_80_150' });
  assert.deepEqual(transitionData(job.transitionResult), { salary: 'sal_80_150' });
});

test('порядок: занятость → оплата, формат → переезд → переработки', async () => {
  const employment = await runStep('await_employment', { goal: 'job' }, { callbackPayload: 'free' });
  assert.equal((employment.transitionResult as { step: Step }).step, 'await_salary');
  const format = await runStep('await_work_format', { goal: 'job' }, { callbackPayload: 'remote' });
  assert.equal((format.transitionResult as { step: Step }).step, 'await_relocation');
  const relocation = await runStep('await_relocation', { goal: 'job' }, { callbackPayload: 'reloc_yes' });
  assert.equal((relocation.transitionResult as { step: Step }).step, 'await_overtime');
});

test('проверка ЗП: работа, мало опыта и завышенные ожидания → вопрос о пересмотре', async () => {
  const { transitionResult, replies } = await runStep(
    'await_motivation',
    { goal: 'job', experience: 'exp_0_1', salary: 'sal_150_300' },
    { callbackPayload: 'growth' },
  );
  assert.equal((transitionResult as { step: Step }).step, 'await_salary_revision');
  assert.ok(replies[0].includes('0–1 год'));
  assert.ok(replies[0].includes('150–300'));
});

test('проверка ЗП: адекватные ожидания и стажировка — сразу итог', async () => {
  const job = await runStep('await_motivation', { goal: 'job', experience: 'exp_4_5', salary: 'sal_150_300' }, { callbackPayload: 'growth' });
  assert.equal((job.transitionResult as { step: Step }).step, 'await_final_action');

  const internship = await runStep('await_motivation', { goal: 'internship', experience: 'exp_no', salary: 'intern_paid' }, { callbackPayload: 'growth' });
  assert.equal((internship.transitionResult as { step: Step }).step, 'await_final_action');
});

test('проверка ЗП: ответ на вопрос о пересмотре сохраняется и ведёт к итогу', async () => {
  const { transitionResult } = await runStep('await_salary_revision', { goal: 'job' }, { callbackPayload: 'rev_yes' });
  assert.equal((transitionResult as { step: Step }).step, 'await_final_action');
  assert.deepEqual(transitionData(transitionResult), { salaryRevision: 'rev_yes' });
});

test('isSalaryInflated: пороги по опыту', () => {
  assert.equal(isSalaryInflated('exp_0_1', 'sal_50_80'), false);
  assert.equal(isSalaryInflated('exp_0_1', 'sal_80_150'), true);
  assert.equal(isSalaryInflated('exp_2_3', 'sal_80_150'), false);
  assert.equal(isSalaryInflated('exp_2_3', 'sal_150_300'), true);
  assert.equal(isSalaryInflated('exp_4_5', 'sal_300p'), true);
  assert.equal(isSalaryInflated('exp_5p', 'sal_300p'), false);
  assert.equal(isSalaryInflated('exp_yes', 'intern_paid'), false);
});

test('intercept: клик по кнопке текущего вопроса пропускается дальше (undefined)', async () => {
  const { transitionResult } = await runIntercept('await_goal', { studyStage: 'uni_3_4' }, { callbackPayload: 'job' });
  assert.equal(transitionResult, undefined);
});

test('intercept: клик по кнопке уже отвеченного блока обновляет поле и схлопывает вопрос', async () => {
  const { transitionResult, edits } = await runIntercept(
    'await_work_format',
    { studyStage: 'uni_3_4', goal: 'job', field: 'it' },
    { callbackPayload: 'economics' },
  );
  assert.equal(transitionResult!.type, 'stay');
  assert.deepEqual(transitionData(transitionResult), { field: 'economics' });
  assert.equal(edits.length, 1);
  assert.ok(edits[0].includes('Сфера'));
});

test('intercept: смена цели сбрасывает опыт и оплату и переспрашивает их с вариантами новой ветки', async () => {
  const { transitionResult, replies } = await runIntercept(
    'await_work_format',
    { goal: 'job', experience: 'exp_2_3', salary: 'sal_80_150' },
    { callbackPayload: 'internship' },
  );
  const data = transitionData(transitionResult)!;
  assert.equal(data.goal, 'internship');
  assert.ok('experience' in data && data.experience === undefined);
  assert.ok('salary' in data && data.salary === undefined);
  assert.equal(replies.length, 2);
  assert.ok(replies[0].includes('Опыт'));
  assert.ok(replies[1].includes('Оплата'));
});

test('intercept: старая кнопка опыта от другой ветки не применяется', async () => {
  const { transitionResult } = await runIntercept('await_work_format', { goal: 'internship' }, { callbackPayload: 'exp_2_3' });
  assert.equal(transitionResult, undefined);
});

test('intercept: посторонний payload (например action-кнопки verify/offers) не перехватывается', async () => {
  const { transitionResult } = await runIntercept('await_final_action', {}, { callbackPayload: 'verify' });
  assert.equal(transitionResult, undefined);
});

test('intercept: кнопка «✏️ Изменить» (edit:field) заново показывает варианты этого вопроса', async () => {
  const { transitionResult, replies } = await runIntercept('await_salary', { goal: 'job' }, { callbackPayload: 'edit:goal' });
  assert.ok(transitionResult);
  assert.equal(transitionResult!.type, 'stay');
  assert.equal(replies.length, 1);
  assert.ok(replies[0].includes('Изменить: Цель'));
});

test('intercept: edit: с неизвестным полем игнорируется (undefined)', async () => {
  const { transitionResult } = await runIntercept('await_salary', {}, { callbackPayload: 'edit:notAField' });
  assert.equal(transitionResult, undefined);
});

test('await_final_action: verify ведёт к запросу ИНН, offers остаётся на месте', async () => {
  const verify = await runStep('await_final_action', {}, { callbackPayload: 'verify' });
  assert.equal(verify.transitionResult.type, 'goto');
  assert.equal((verify.transitionResult as { step: Step }).step, 'await_inn');

  const offers = await runStep('await_final_action', { field: 'it', goal: 'internship' }, { callbackPayload: 'offers' });
  assert.equal(offers.transitionResult.type, 'stay');
  assert.ok(offers.replies[0].length > 0);
});

test('await_inn: клик "Посмотреть предложения" со старой клавиатуры не ломается на "невалидный ИНН"', async () => {
  const { transitionResult, replies } = await runStep(
    'await_inn',
    { field: 'it', goal: 'internship' },
    { callbackPayload: 'offers' },
  );
  assert.equal(transitionResult.type, 'stay');
  assert.ok(!replies.some((text) => text.includes('ИНН')));
});

test('await_inn: обычный текст не похожий на ИНН всё ещё отклоняется', async () => {
  const { transitionResult, replies } = await runStep('await_inn', {}, { text: 'не число' });
  assert.equal(transitionResult.type, 'stay');
  assert.ok(replies.some((text) => text.includes('ИНН')));
});

test('isValidInnFormat: принимает 10 и 12 цифр, отклоняет остальное', () => {
  assert.equal(isValidInnFormat('1234567890'), true);
  assert.equal(isValidInnFormat('123456789012'), true);
  assert.equal(isValidInnFormat('12345'), false);
  assert.equal(isValidInnFormat('12345678901234'), false);
  assert.equal(isValidInnFormat('abcdefghij'), false);
});

test('служебные сообщения: повторная ошибка удаляет предыдущую, в чате висит одна', async () => {
  const { transitionResult, deleted } = await runStep(
    'await_study_stage',
    { serviceMessageIds: ['old-error'] },
    { text: 'просто текст' },
  );
  assert.equal(transitionResult.type, 'stay');
  assert.deepEqual(deleted, ['old-error']);
  assert.deepEqual(transitionData(transitionResult), { serviceMessageIds: ['m1'] });
});

test('служебные сообщения: правильный ответ удаляет висящую ошибку', async () => {
  const { transitionResult, deleted } = await runStep(
    'await_study_stage',
    { serviceMessageIds: ['old-error'] },
    { callbackPayload: 'graduated' },
  );
  assert.equal(transitionResult.type, 'goto');
  assert.deepEqual(deleted, ['old-error']);
  assert.deepEqual(transitionData(transitionResult), { studyStage: 'graduated', serviceMessageIds: [] });
});

test('город: быстрая кнопка', async () => {
  const { transitionResult, edits } = await runStep('await_city', { goal: 'job', cityPromptId: 'p1' }, { callbackPayload: 'city:kzn' });
  assert.equal((transitionResult as { step: Step }).step, 'await_field');
  assert.deepEqual(transitionData(transitionResult), { city: 'Казань' });
  assert.ok(edits[0].includes('Казань'));
});

test('город: геопозиция рядом с известным городом', async () => {
  const { transitionResult, edits } = await runStep(
    'await_city',
    { goal: 'job', cityPromptId: 'p1' },
    { location: { latitude: 55.75, longitude: 49.2 } },
  );
  assert.deepEqual(transitionData(transitionResult), { city: 'Казань' });
  assert.ok(edits[0].includes('по геопозиции'));
});

test('город: геопозиция далеко от всех городов — честно переспрашиваем', async () => {
  const { transitionResult, replies } = await runStep(
    'await_city',
    { goal: 'job', cityPromptId: 'p1' },
    { location: { latitude: 43.1, longitude: 131.9 } },
  );
  assert.equal(transitionResult.type, 'stay');
  assert.ok(replies[0].includes('Не смог определить город'));
});

test('город: текст по-прежнему принимается', async () => {
  const { transitionResult } = await runStep('await_city', { goal: 'job', cityPromptId: 'p1' }, { text: 'Тула' });
  assert.deepEqual(transitionData(transitionResult), { city: 'Тула' });
});

test('intercept: «✏️ Изменить» у города присылает новый вопрос и запоминает его id', async () => {
  const { transitionResult, replies } = await runIntercept('await_salary', { city: 'Тула' }, { callbackPayload: 'edit:city' });
  assert.equal(transitionResult!.type, 'stay');
  assert.ok(replies[0].includes('Изменить: Город'));
  assert.deepEqual(transitionData(transitionResult), { cityPromptId: 'm1' });
});

test('intercept: быстрая кнопка города на более позднем шаге обновляет город', async () => {
  const { transitionResult } = await runIntercept('await_salary', { city: 'Тула', cityPromptId: 'p1' }, { callbackPayload: 'city:spb' });
  assert.deepEqual(transitionData(transitionResult), { city: 'Санкт-Петербург' });
});

test('intercept: геопозиция до вопроса о городе не перехватывается', async () => {
  const { transitionResult } = await runIntercept('await_name', {}, { location: { latitude: 55.75, longitude: 37.6 } });
  assert.equal(transitionResult, undefined);
});

test('nearestCity: находит ближайший город и расстояние', () => {
  const { city, distanceKm } = nearestCity(59.9, 30.3);
  assert.equal(city.name, 'Санкт-Петербург');
  assert.ok(distanceKm < 10);
});

test('matchVacancies: подбирает не больше лимита и учитывает направление', () => {
  const result = matchVacancies({ field: 'it', goal: 'internship', city: 'Москва' }, 3);
  assert.ok(result.length <= 3);
  assert.ok(result.length > 0);
});
