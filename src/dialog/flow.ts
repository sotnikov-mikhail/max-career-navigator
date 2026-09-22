import { defineScenario, transition, type ScenarioStep } from '@maxhub/max-bot-api';
import { choiceKeyboard, choiceKeyboardRow, actionsKeyboard } from '../keyboards.js';
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

/** Реестр всех закрытых вопросов сценария. Нужен, чтобы:
 * 1) распознать клик по кнопке из уже пройденного блока (пользователь хочет исправить старый ответ);
 * 2) знать, что показать заново, когда нажата кнопка «✏️ Изменить». */
interface ChoiceFieldConfig {
  field: keyof ProfileData;
  title: string;
  options: ChoiceOption[];
}

const CHOICE_FIELDS: ChoiceFieldConfig[] = [
  { field: 'studyStage', title: 'Этап обучения', options: STUDY_STAGE_OPTIONS },
  { field: 'goal', title: 'Цель', options: GOAL_OPTIONS },
  { field: 'field', title: 'Сфера', options: FIELD_OPTIONS },
  { field: 'employment', title: 'Занятость', options: EMPLOYMENT_OPTIONS },
  { field: 'employmentFormal', title: 'Официальность занятости', options: EMPLOYMENT_FORMAL_OPTIONS },
  { field: 'salary', title: 'Ожидания по зарплате', options: SALARY_OPTIONS },
  { field: 'workFormat', title: 'Формат работы', options: WORK_FORMAT_OPTIONS },
  { field: 'overtime', title: 'Переработки', options: OVERTIME_OPTIONS },
  { field: 'motivation', title: 'Мотивация', options: MOTIVATION_OPTIONS },
];

/** Какое поле профиля ожидает текущий шаг — чтобы отличить «это ответ на текущий вопрос»
 * от «это клик по кнопке из старого блока». */
const STEP_FIELD: Partial<Record<Step, keyof ProfileData>> = {
  await_study_stage: 'studyStage',
  await_goal: 'goal',
  await_field: 'field',
  await_employment: 'employment',
  await_employment_formal: 'employmentFormal',
  await_salary: 'salary',
  await_work_format: 'workFormat',
  await_overtime: 'overtime',
  await_motivation: 'motivation',
};

function findChoiceField(payload: string | undefined): { config: ChoiceFieldConfig; option: ChoiceOption } | undefined {
  if (!payload) return undefined;
  for (const config of CHOICE_FIELDS) {
    const option = config.options.find((o) => o.id === payload);
    if (option) return { config, option };
  }
  return undefined;
}

/** Отправляет текст с markdown-разметкой (жирные заголовки шагов, эмодзи). */
async function sendText(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(text, { format: 'markdown' });
}

/** Отправляет вопрос с кнопками-вариантами (закрытый вопрос, как в обоих черновиках сценария). */
async function sendChoice(ctx: BotContext, text: string, options: ChoiceOption[]): Promise<void> {
  await ctx.reply(text, { format: 'markdown', attachments: [choiceKeyboard(options)] });
}

/** То же самое, но короткие варианты (2 варианта) идут в один ряд — компактнее для бинарного выбора. */
async function sendChoiceRow(ctx: BotContext, text: string, options: ChoiceOption[]): Promise<void> {
  await ctx.reply(text, { format: 'markdown', attachments: [choiceKeyboardRow(options)] });
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
    // Пустая строка убирает спиннер без видимой всплывающей плашки для пользователя.
    await ctx.answerOnCallback({ notification: '' } as Parameters<BotContext['answerOnCallback']>[0]);
  } catch (error) {
    console.error('Не удалось подтвердить callback (не критично, продолжаем)', error);
  }
}

/**
 * Схлопывает вопрос после ответа: убирает варианты, показывает выбранный ответ и
 * оставляет одну кнопку «✏️ Изменить» вместо целого списка. Так пройденные блоки
 * не захламляют чат и не остаются кликабельными по всем старым вариантам сразу.
 */
async function finalizeChoice(ctx: BotContext, field: keyof ProfileData, option: ChoiceOption): Promise<void> {
  const title = CHOICE_FIELDS.find((c) => c.field === field)?.title ?? String(field);
  try {
    await ctx.editMessage({
      text: `✅ **${title}**: ${option.label}`,
      format: 'markdown',
      attachments: [actionsKeyboard([{ label: '✏️ Изменить', payload: `edit:${String(field)}` }])],
    });
  } catch (error) {
    console.error('Не удалось схлопнуть клавиатуру вопроса (не критично)', error);
  }
}

/** Читает выбранный вариант из нажатия кнопки, подтверждает колбэк и схлопывает вопрос. */
async function readChoice(ctx: BotContext, field: keyof ProfileData, options: ChoiceOption[]): Promise<ChoiceOption | undefined> {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  const match = options.find((option) => option.id === payload);
  if (match) await finalizeChoice(ctx, field, match);
  return match;
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
  const match = await readChoice(ctx, 'studyStage', STUDY_STAGE_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoiceRow(ctx, GOAL_PROMPT, GOAL_OPTIONS);
  return transition.goto('await_goal', { studyStage: match.id });
};

const awaitGoal: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, 'goal', GOAL_OPTIONS);
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
  const match = await readChoice(ctx, 'field', FIELD_OPTIONS);
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
  const match = await readChoice(ctx, 'employment', EMPLOYMENT_OPTIONS);
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
  const match = await readChoice(ctx, 'employmentFormal', EMPLOYMENT_FORMAL_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  await sendChoice(ctx, salaryPrompt(goal), SALARY_OPTIONS);
  return transition.goto('await_salary', { employmentFormal: match.id });
};

const awaitSalary: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, 'salary', SALARY_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoice(ctx, WORK_FORMAT_PROMPT, WORK_FORMAT_OPTIONS);
  return transition.goto('await_work_format', { salary: match.id });
};

const awaitWorkFormat: Step_ = async ({ ctx }) => {
  const match = await readChoice(ctx, 'workFormat', WORK_FORMAT_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  await sendChoice(ctx, OVERTIME_PROMPT, OVERTIME_OPTIONS);
  return transition.goto('await_overtime', { workFormat: match.id });
};

const awaitOvertime: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, 'overtime', OVERTIME_OPTIONS);
  if (!match) {
    await ctx.reply(invalidChoicePrompt());
    return transition.stay();
  }
  const goal = (data.goal ?? 'job') as Goal;
  await sendChoice(ctx, motivationPrompt(goal), MOTIVATION_OPTIONS);
  return transition.goto('await_motivation', { overtime: match.id });
};

const awaitMotivation: Step_ = async ({ ctx, data }) => {
  const match = await readChoice(ctx, 'motivation', MOTIVATION_OPTIONS);
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

/** Показывает подобранные демо-предложения. Переиспользуется на шагах финала и ожидания ИНН —
 * кнопка «Посмотреть предложения» на итоговом сообщении остаётся кликабельной и после перехода
 * к вводу ИНН, поэтому оба шага должны уметь её обработать. */
async function sendOffers(ctx: BotContext, data: ProfileData): Promise<void> {
  const offers = matchVacancies(data);
  const lines = offers.map((o: Vacancy) => offerLine(o.title, o.org, o.city, o.pay)).join('\n');
  await sendText(ctx, lines ? `${offersIntro(offers.length)}\n\n${lines}` : offersIntro(0));
}

const awaitFinalAction: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  if (payload === 'verify') {
    await sendText(ctx, VERIFY_INN_PROMPT);
    return transition.goto('await_inn');
  }
  if (payload === 'offers') {
    await sendOffers(ctx, data);
    return transition.stay();
  }
  return transition.stay();
};

const awaitInn: Step_ = async ({ ctx, data }) => {
  // Кнопка «Посмотреть предложения» на итоговом сообщении не исчезает — если пользователь
  // передумал и нажал её вместо ввода ИНН, показываем предложения и остаёмся на этом шаге,
  // а не ругаемся на «невалидный ИНН» (это и была причина бага).
  if (ctx.has('message_callback')) {
    const payload = ctx.callback?.payload;
    await acknowledgeCallback(ctx);
    if (payload === 'offers') {
      await sendOffers(ctx, data);
    } else {
      await sendText(ctx, VERIFY_INN_PROMPT);
    }
    return transition.stay();
  }
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
  /**
   * Срабатывает перед каждым шагом. Обрабатывает две ситуации с кнопками из чата выше:
   * 1) payload вида `edit:<field>` — нажата кнопка «✏️ Изменить» на уже свёрнутом вопросе,
   *    заново показываем варианты для этого поля;
   * 2) payload — валидный вариант другого (не текущего) вопроса — пользователь кликнул
   *    старую кнопку до того, как появилась «✏️ Изменить» (например, до перерисовки),
   *    обновляем поле и сворачиваем этот вопрос так же, как обычный ответ.
   * Кнопки старых сообщений в MAX остаются кликабельными даже после того, как чат ушёл
   * вперёд — без этого перехвата это выглядело бы как «выбери один из вариантов ниже».
   */
  intercept: async ({ ctx, state, data }) => {
    if (!ctx.has('message_callback')) return undefined;
    const payload = ctx.callback?.payload;

    if (payload?.startsWith('edit:')) {
      const field = payload.slice('edit:'.length) as keyof ProfileData;
      const config = CHOICE_FIELDS.find((c) => c.field === field);
      if (!config) return undefined;
      await acknowledgeCallback(ctx);
      await sendChoice(ctx, `✏️ **Изменить: ${config.title}**\n\nВыбери новый вариант:`, config.options);
      return transition.stay();
    }

    const match = findChoiceField(payload);
    if (!match) return undefined;
    if (match.config.field === STEP_FIELD[state.step]) return undefined;
    await acknowledgeCallback(ctx);
    await finalizeChoice(ctx, match.config.field, match.option);
    return transition.stay({ [match.config.field]: match.option.id } as Partial<ProfileData>);
  },
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
