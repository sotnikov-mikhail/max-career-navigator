import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScenarioState } from '@maxhub/max-bot-api';
import { careerScenario } from '../src/dialog/flow.js';
import type { BotContext, ProfileData, Step } from '../src/dialog/types.js';
import { isValidInnFormat } from '../src/services/verification.js';
import { matchVacancies } from '../src/services/matching.js';

interface FakeCtxOptions {
  text?: string;
  callbackPayload?: string;
}

function fakeCtx(options: FakeCtxOptions = {}) {
  const replies: string[] = [];
  const answeredCallbacks: number[] = [];
  const ctx = {
    message: options.text !== undefined ? { body: { text: options.text } } : undefined,
    callback: options.callbackPayload !== undefined ? { payload: options.callbackPayload } : undefined,
    chatId: 42,
    has: (filter: string) => (filter === 'message_callback' ? options.callbackPayload !== undefined : options.text !== undefined),
    reply: async (text: string) => {
      replies.push(text);
      return {} as never;
    },
    answerOnCallback: async () => {
      answeredCallbacks.push(1);
      return {} as never;
    },
  };
  return { ctx: ctx as unknown as BotContext, replies, answeredCallbacks };
}

function fakeState(step: Step): ScenarioState<ProfileData, Step> {
  return { id: 'career-navigator', step, data: {} };
}

async function runStep(step: Step, data: ProfileData, ctxOptions: FakeCtxOptions) {
  const { ctx, replies } = fakeCtx(ctxOptions);
  const stepFn = careerScenario.steps[step];
  const transitionResult = await stepFn({ ctx, state: fakeState(step), data });
  return { transitionResult, replies, ctx };
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

test('matchVacancies: подбирает не больше лимита и учитывает направление', () => {
  const result = matchVacancies({ field: 'it', goal: 'internship', city: 'Москва' }, 3);
  assert.ok(result.length <= 3);
  assert.ok(result.length > 0);
});
