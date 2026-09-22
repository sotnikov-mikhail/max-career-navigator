import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScenarioState } from '@maxhub/max-bot-api';
import { careerScenario } from '../src/dialog/flow.js';
import type { BotContext, ProfileData, Step } from '../src/dialog/types.js';
import { isValidInnFormat } from '../src/services/verification.js';
import { matchVacancies } from '../src/services/matching.js';
import { nearestCity } from '../src/services/geo.js';

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

test('await_employment: подработка ведёт к вопросу об официальности', async () => {
  const { transitionResult } = await runStep('await_employment', { goal: 'job' }, { callbackPayload: 'side_job' });
  assert.equal(transitionResult.type, 'goto');
  assert.equal((transitionResult as { step: Step }).step, 'await_employment_formal');
});

test('await_employment: "свободен" пропускает вопрос об официальности и идёт сразу к зарплате', async () => {
  const { transitionResult } = await runStep('await_employment', { goal: 'internship' }, { callbackPayload: 'free' });
  assert.equal(transitionResult.type, 'goto');
  assert.equal((transitionResult as { step: Step }).step, 'await_salary');
});

test('intercept: клик по кнопке текущего вопроса пропускается дальше (undefined)', async () => {
  const { transitionResult } = await runIntercept('await_goal', { studyStage: 'uni_3_4' }, { callbackPayload: 'job' });
  assert.equal(transitionResult, undefined);
});

test('intercept: клик по кнопке уже отвеченного блока обновляет поле и схлопывает вопрос', async () => {
  const { transitionResult, edits } = await runIntercept(
    'await_salary',
    { studyStage: 'uni_3_4', goal: 'job' },
    { callbackPayload: 'internship' },
  );
  assert.ok(transitionResult);
  assert.equal(transitionResult!.type, 'stay');
  assert.deepEqual((transitionResult as { data?: Partial<ProfileData> }).data, { goal: 'internship' });
  assert.equal(edits.length, 1);
  assert.ok(edits[0].includes('Цель'));
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
