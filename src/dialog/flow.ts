import { defineScenario, transition, type ScenarioStep } from '@maxhub/max-bot-api';
import { choiceKeyboard, actionsKeyboard } from '../keyboards.js';
import { matchVacancies, type Vacancy } from '../services/matching.js';
import { isValidInnFormat, runDemoVerification } from '../services/verification.js';
import { submitToLaborExchangeMock } from '../services/laborExchangeMock.js';
import type { BotContext, ProfileData, Step, Goal } from './types.js';
import {
  GREETING,
  NAME_EMPTY_PROMPT,
  STUDY_STAGE_OPTIONS,
  studyStagePrompt,
  GOAL_OPTIONS,
  GOAL_PROMPT,
  cityPrompt,
  CITY_EMPTY_PROMPT,
  FIELD_OPTIONS,
  fieldPrompt,
  interestPrompt,
  INTEREST_EMPTY_PROMPT,
  EMPLOYMENT_OPTIONS,
  employmentPrompt,
  EMPLOYMENT_FORMAL_OPTIONS,
  EMPLOYMENT_FORMAL_PROMPT,
  SALARY_OPTIONS,
  salaryPrompt,
  WORK_FORMAT_OPTIONS,
  WORK_FORMAT_PROMPT,
  OVERTIME_OPTIONS,
  OVERTIME_PROMPT,
  MOTIVATION_OPTIONS,
  motivationPrompt,
  invalidChoicePrompt,
  finalSummary,
  FINAL_BUTTON_VERIFY,
  FINAL_BUTTON_OFFERS,
  VERIFY_INN_PROMPT,
  VERIFY_INN_INVALID,
  VERIFY_PROCESSING,
  verifySuccess,
  offersIntro,
  offerLine,
  type ChoiceOption,
} from './script.js';

type Step_ = ScenarioStep<BotContext, ProfileData, Step>;

/** Отправляет текст с markdown-разметкой (жирные заголовки шагов, эмодзи). */
async function sendText(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(text, { format: 'markdown' });
}

/** Отправляет вопрос с кнопками-вариантами (закрытый вопрос, как в обоих черновиках сценария). */
async function sendChoice(ctx: BotContext, text: string, options: ChoiceOption[]): Promise<void> {
  await ctx.reply(text, { format: 'markdown', attachments: [choiceKeyboard(options)] });
}

/**
 * Подтверждает нажатие кнопки (убирает спиннер загрузки у пользователя).
 * MAX отклоняет пустое тело `{}` ошибкой 400 «message or notification required» —
 * это поле не описано в типах SDK 0.3.1, поэтому приводим тип вручную.
 * Обёрнуто в try/catch: подтверждение — не критично, обработка ответа не должна падать из-за него.
 */
async function acknowledgeCallback(ctx: BotContext): Promise<void> {
  if (!ctx.has('message_callback')) return;
  try {
    await ctx.answerOnCallback({ notification: 'Принято' } as Parameters<BotContext['answerOnCallback']>[0]);
  } catch (error) {
    console.error('Не удалось подтвердить callback (не критично, продолжаем)', error);
  }
}

/** Читает выбранный вариант из нажатия кнопки; подтверждает получение колбэка. */
async function readChoice(ctx: BotContext, options: ChoiceOption[]): Promise<ChoiceOption | undefined> {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  return options.find((option) => option.id === payload);
}

/** Читает свободный текст пользователя. */
function readText(ctx: BotContext): string | undefined {
  const text = ctx.message?.body.text?.trim();
  return text && text.length > 0 ? text : undefined;
}

const REQUIRED_FIELDS: Array<keyof ProfileData> = [
  'name',
  'studyStage',
  'goal',
  'city',
  'field',
  'interest',
  'employment',
  'salary',
  'workFormat',
  'overtime',
  'motivation',
];

function computeCompleteness(data: ProfileData): number {
  const total = REQUIRED_FIELDS.length + (data.employmentFormal ? 1 : 0);
  const filled = REQUIRED_FIELDS.filter((field) => Boolean(data[field])).length + (data.employmentFormal ? 1 : 0);
  return Math.round((filled / total) * 100);
}

/** Шаг запуска сценария: приветствие + запрос имени (объединение обоих черновиков). */
const greet: Step_ = async ({ ctx }) => {
  await sendText(ctx, GREETING);
  return transition.goto('await_name');
};

const awaitName: Step_ = async ({ ctx, data }) => {
  const name = readText(ctx);
  if (!name) {
    await ctx.reply(NAME_EMPTY_PROMPT);
    return transition.stay();
  }
  await sendChoice(ctx, studyStagePrompt(name), STUDY_STAGE_OPTIONS);
  return transition.goto('await_study_stage', { name });
};

const awaitStudyStage: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, STUDY_STAGE_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoice(ctx, GOAL_PROMPT, GOAL_OPTIONS);
  return transition.goto('await_goal', { studyStage: match.id });
};

const awaitGoal: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, GOAL_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendText(ctx, cityPrompt());
  return transition.goto('await_city', { goal: match.id as Goal });
};

const awaitCity: Step_ = async ({ ctx, data }) => {
  const city = readText(ctx);
  if (!city) {
    await ctx.reply(CITY_EMPTY_PROMPT);
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  await sendChoice(ctx, fieldPrompt(goal), FIELD_OPTIONS);
  return transition.goto('await_field', { city });
};

const awaitField: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, FIELD_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendText(ctx, interestPrompt());
  return transition.goto('await_interest', { field: match.id });
};

const awaitInterest: Step_ = async ({ ctx }) => {
  const interest = readText(ctx);
  if (!interest) {
    await ctx.reply(INTEREST_EMPTY_PROMPT);
    return transition.stay();
  }
  await sendChoice(ctx, employmentPrompt(), EMPLOYMENT_OPTIONS);
  return transition.goto('await_employment', { interest });
};

const CURRENTLY_WORKING_IDS = new Set(['side_job', 'working']);

const awaitEmployment: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, EMPLOYMENT_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  if (CURRENTLY_WORKING_IDS.has(match.id)) {
    await sendChoice(ctx, EMPLOYMENT_FORMAL_PROMPT, EMPLOYMENT_FORMAL_OPTIONS);
    return transition.goto('await_employment_formal', { employment: match.id });
  }
  await sendChoice(ctx, salaryPrompt(goal), SALARY_OPTIONS);
  return transition.goto('await_salary', { employment: match.id });
};

const awaitEmploymentFormal: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, EMPLOYMENT_FORMAL_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  await sendChoice(ctx, salaryPrompt(goal), SALARY_OPTIONS);
  return transition.goto('await_salary', { employmentFormal: match.id });
};

const awaitSalary: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, SALARY_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoice(ctx, WORK_FORMAT_PROMPT, WORK_FORMAT_OPTIONS);
  return transition.goto('await_work_format', { salary: match.id });
};

const awaitWorkFormat: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, WORK_FORMAT_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoice(ctx, OVERTIME_PROMPT, OVERTIME_OPTIONS);
  return transition.goto('await_overtime', { workFormat: match.id });
};

const awaitOvertime: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, OVERTIME_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  await sendChoice(ctx, motivationPrompt(goal), MOTIVATION_OPTIONS);
  return transition.goto('await_motivation', { overtime: match.id });
};

const awaitMotivation: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, MOTIVATION_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const finalData: ProfileData = { ...data, motivation: match.id };
  const completeness = computeCompleteness(finalData);
  const offers = matchVacancies(finalData);
  await ctx.reply(finalSummary(completeness, offers.length), {
    format: 'markdown',
    attachments: [
      actionsKeyboard([
        { label: FINAL_BUTTON_VERIFY, payload: 'verify' },
        { label: FINAL_BUTTON_OFFERS, payload: 'offers' },
      ]),
    ],
  });
  return transition.goto('await_final_action', { motivation: match.id });
};

const awaitFinalAction: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  if (payload === 'verify') {
    await sendText(ctx, VERIFY_INN_PROMPT);
    return transition.goto('await_inn');
  }
  if (payload === 'offers') {
    const offers = matchVacancies(data);
    const lines = offers.map((o: Vacancy) => offerLine(o.title, o.org, o.city, o.pay)).join('\n');
    await sendText(ctx, lines ? `${offersIntro(offers.length)}\n\n${lines}` : offersIntro(0));
    return transition.stay();
  }
  return transition.stay();
};

const awaitInn: Step_ = async ({ ctx, data }) => {
  const inn = readText(ctx);
  if (!inn || !isValidInnFormat(inn)) {
    await ctx.reply(VERIFY_INN_INVALID);
    return transition.stay();
  }
  await sendText(ctx, VERIFY_PROCESSING);
  await runDemoVerification();
  const chatId = ctx.chatId ?? 0;
  submitToLaborExchangeMock(chatId, data);
  await sendText(ctx, verifySuccess());
  return transition.complete();
};

export const careerScenario = defineScenario<BotContext, ProfileData>()<Step>({
  id: 'career-navigator',
  initialStep: 'greet',
  idleTimeoutMs: 30 * 60 * 1000,
  createData: () => ({}),
  steps: {
    greet,
    await_name: awaitName,
    await_study_stage: awaitStudyStage,
    await_goal: awaitGoal,
    await_city: awaitCity,
    await_field: awaitField,
    await_interest: awaitInterest,
    await_employment: awaitEmployment,
    await_employment_formal: awaitEmploymentFormal,
    await_salary: awaitSalary,
    await_work_format: awaitWorkFormat,
    await_overtime: awaitOvertime,
    await_motivation: awaitMotivation,
    await_final_action: awaitFinalAction,
    await_inn: awaitInn,
  },
});
