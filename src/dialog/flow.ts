import { defineScenario, fmt, transition, type ScenarioStep } from '@maxhub/max-bot-api';
import { actionsKeyboard, autoKeyboard, choiceKeyboard, cityKeyboard, multiKeyboard } from '../keyboards.js';
import { isValidIdFormat, missingPassportFields, runDemoVerification } from '../services/verification.js';
import { submitProfileMock } from '../services/profileRegistryMock.js';
import { KNOWN_CITIES, MAX_CITY_DISTANCE_KM, cityById, nearestCity } from '../services/geo.js';
import type { BotContext, Goal, ProfileAnswers, ProfileData, Step } from './types.js';
import {
  BACK_BUTTON_LABEL,
  BANK_OPTIONS,
  BANK_PROMPT,
  CHANGE_VERIFICATION_LABEL,
  CITY_EMPTY_PROMPT,
  CITY_PROMPT,
  CONTACT_OPTIONS,
  CONTACT_PROMPT,
  EMPLOYMENT_OPTIONS,
  EMPLOYMENT_PROMPT,
  FIELD_OPTIONS,
  FIELD_PROMPT,
  FINAL_BUTTON_PROFILE,
  FINAL_MESSAGE,
  PROFILE_FOOTER,
  GOAL_OPTIONS,
  GOAL_PROMPT,
  GREETING,
  JOB_SALARY_FIX_OPTIONS,
  MANUAL_ID_INVALID,
  MANUAL_ID_PROMPT,
  MANUAL_PASSPORT_PROMPT,
  MANUAL_PASSPORT_SECOND_PAGE,
  MIDPOINT_CONTINUE_LABEL,
  MIDPOINT_MESSAGE,
  MOTIVATION_COUNT,
  MOTIVATION_OPTIONS,
  NAME_EMPTY_PROMPT,
  NAME_QUESTION,
  OVERTIME_OPTIONS,
  OVERTIME_PROMPT,
  RELOCATION_OPTIONS,
  RELOCATION_PROMPT,
  SALARY_CORRECTION_OPTIONS,
  SALARY_CORRECTION_PROMPT,
  SALARY_FIX_PROMPT,
  STUDY_STAGE_OPTIONS,
  VERIFICATION_OPTIONS,
  VERIFICATION_PROMPT,
  WORK_FORMAT_OPTIONS,
  WORK_FORMAT_PROMPT,
  cityTooFarPrompt,
  experienceOptions,
  experiencePrompt,
  invalidChoicePrompt,
  manualPassportMissing,
  motivationPrompt,
  salaryOptions,
  salaryPrompt,
  salaryTitle,
  studyStagePrompt,
  verificationProcessing,
  type ChoiceOption,
} from './script.js';

type Step_ = ScenarioStep<BotContext, ProfileData, Step>;
type Transition = Awaited<ReturnType<Step_>>;
type Keyboard = ReturnType<typeof choiceKeyboard>;

interface QuestionView {
  text: string;
  keyboard?: Keyboard;
}

function goalOf(data: ProfileData): Goal {
  return data.goal ?? 'job';
}

// ---------------------------------------------------------------------------
// Вопросы-«блоки»: после ответа сообщение с вопросом сворачивается в «Вопрос: ответ».
// ---------------------------------------------------------------------------

/** Шаги, чьё сообщение с вопросом сворачивается в блок (у остальных — свободный ввод или финал). */
const BLOCK_STEPS: ReadonlySet<Step> = new Set<Step>([
  'await_study_stage',
  'await_goal',
  'await_city',
  'await_field',
  'await_experience',
  'await_employment',
  'await_salary',
  'await_work_format',
  'await_relocation',
  'await_overtime',
  'await_motivation',
  'await_salary_correction',
  'await_salary_fix',
  'await_verification',
  'await_bank',
  'await_contact',
]);

/** Шаги, чьё сообщение запоминается, чтобы удалить его («Изменить», напоминание, «Продолжить»). */
const TRACKED_STEPS: ReadonlySet<Step> = new Set<Step>([...BLOCK_STEPS, 'await_midpoint', 'await_passport', 'await_inn']);

/** На какой шаг вернуться, если нажать «Изменить» у блока этого поля. */
const FIELD_STEP: Partial<Record<keyof ProfileAnswers, Step>> = {
  studyStage: 'await_study_stage',
  goal: 'await_goal',
  city: 'await_city',
  field: 'await_field',
  experience: 'await_experience',
  employment: 'await_employment',
  salary: 'await_salary',
  workFormat: 'await_work_format',
  relocation: 'await_relocation',
  overtime: 'await_overtime',
};

/** Варианты ответа для шага с выбором (для проверки payload). */
function stepOptions(step: Step, data: ProfileData): ChoiceOption[] {
  const goal = goalOf(data);
  switch (step) {
    case 'await_study_stage':
      return STUDY_STAGE_OPTIONS;
    case 'await_goal':
      return GOAL_OPTIONS;
    case 'await_field':
      return FIELD_OPTIONS;
    case 'await_experience':
      return experienceOptions(goal);
    case 'await_employment':
      return EMPLOYMENT_OPTIONS;
    case 'await_salary':
      return salaryOptions(goal);
    case 'await_work_format':
      return WORK_FORMAT_OPTIONS;
    case 'await_relocation':
      return RELOCATION_OPTIONS;
    case 'await_overtime':
      return OVERTIME_OPTIONS;
    case 'await_salary_correction':
      return SALARY_CORRECTION_OPTIONS;
    case 'await_salary_fix':
      return JOB_SALARY_FIX_OPTIONS;
    case 'await_verification':
      return VERIFICATION_OPTIONS;
    case 'await_bank':
      return BANK_OPTIONS;
    case 'await_contact':
      return CONTACT_OPTIONS;
    default:
      return [];
  }
}

/** Как выглядит вопрос шага: текст + клавиатура. Используется и при первом показе, и при «Изменить», и в напоминаниях. */
function questionView(step: Step, data: ProfileData): QuestionView {
  const goal = goalOf(data);
  const options = stepOptions(step, data);
  switch (step) {
    case 'await_name':
      return { text: NAME_QUESTION };
    case 'await_study_stage':
      return { text: studyStagePrompt(data.name), keyboard: autoKeyboard(options) };
    case 'await_goal':
      return { text: GOAL_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_city':
      return { text: CITY_PROMPT, keyboard: cityKeyboard(KNOWN_CITIES) };
    case 'await_field':
      return { text: FIELD_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_experience':
      return { text: experiencePrompt(goal), keyboard: autoKeyboard(options) };
    case 'await_employment':
      return { text: EMPLOYMENT_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_salary':
      return { text: salaryPrompt(goal), keyboard: autoKeyboard(options) };
    case 'await_midpoint':
      return { text: MIDPOINT_MESSAGE, keyboard: actionsKeyboard([{ label: MIDPOINT_CONTINUE_LABEL, payload: 'continue' }]) };
    case 'await_work_format':
      return { text: WORK_FORMAT_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_relocation':
      return { text: RELOCATION_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_overtime':
      return { text: OVERTIME_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_motivation':
      return {
        text: motivationPrompt((data.motivationDraft ?? []).length),
        keyboard: multiKeyboard(MOTIVATION_OPTIONS, data.motivationDraft ?? []),
      };
    case 'await_salary_correction':
      // Столбиком: в половину ширины «Оставить сумму» обрезается.
      return { text: SALARY_CORRECTION_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_salary_fix':
      return { text: SALARY_FIX_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_verification':
      return { text: VERIFICATION_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_bank':
      return {
        text: BANK_PROMPT,
        keyboard: actionsKeyboard([
          ...options.map((o) => ({ label: o.label, payload: o.id })),
          { label: CHANGE_VERIFICATION_LABEL, payload: 'change_verification' },
        ]),
      };
    case 'await_passport':
      return { text: MANUAL_PASSPORT_PROMPT, keyboard: changeVerificationKeyboard() };
    case 'await_inn':
      return { text: MANUAL_ID_PROMPT, keyboard: changeVerificationKeyboard() };
    case 'await_contact':
      return { text: CONTACT_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_final_action':
      return {
        text: FINAL_MESSAGE,
        keyboard: actionsKeyboard([{ label: FINAL_BUTTON_PROFILE, payload: 'profile' }]),
      };
    default:
      return { text: '' };
  }
}

function labelOf(options: ChoiceOption[], id: string | undefined): string {
  return options.find((o) => o.id === id)?.label ?? '—';
}

const FIELD_TITLES: Partial<Record<keyof ProfileAnswers, string>> = {
  studyStage: 'Этап обучения',
  goal: 'Цель',
  city: 'Город',
  field: 'Сфера',
  experience: 'Опыт',
  employment: 'Готов(а) уделять',
  workFormat: 'Формат занятости',
  relocation: 'Переезд',
  overtime: 'Переработки и жёсткие сроки',
  motivation: 'Мотивация',
  salaryRevision: 'Корректировка ЗП',
  verificationMethod: 'Верификация',
  contact: 'Связь с экспертами',
};

function fieldTitle(field: keyof ProfileAnswers, data: ProfileData): string {
  if (field === 'salary') return salaryTitle(goalOf(data));
  return FIELD_TITLES[field] ?? String(field);
}

/** Подпись ответа для свёрнутого блока и карточки профиля. */
function answerLabel(field: keyof ProfileAnswers, data: ProfileData): string {
  const goal = goalOf(data);
  switch (field) {
    case 'name':
      return data.name ?? '—';
    case 'studyStage':
      return labelOf(STUDY_STAGE_OPTIONS, data.studyStage);
    case 'goal':
      return labelOf(GOAL_OPTIONS, data.goal);
    case 'city':
      return data.city ? `📍 ${data.city}${data.cityFromGeo ? ' (по геопозиции)' : ''}` : '—';
    case 'field':
      return labelOf(FIELD_OPTIONS, data.field);
    case 'experience':
      return labelOf(experienceOptions(goal), data.experience);
    case 'employment':
      return labelOf(EMPLOYMENT_OPTIONS, data.employment);
    case 'salary':
      return labelOf(salaryOptions(goal), data.salary);
    case 'workFormat':
      return labelOf(WORK_FORMAT_OPTIONS, data.workFormat);
    case 'relocation':
      return labelOf(RELOCATION_OPTIONS, data.relocation);
    case 'overtime':
      return labelOf(OVERTIME_OPTIONS, data.overtime);
    case 'motivation':
      // Array.isArray — в старых сессиях мотивация хранилась строкой.
      return (Array.isArray(data.motivation) ? data.motivation : []).map((id) => labelOf(MOTIVATION_OPTIONS, id)).join(', ') || '—';
    case 'salaryRevision':
      return data.salaryRevision === 'keep' ? labelOf(SALARY_CORRECTION_OPTIONS, 'keep_salary') : '✏️ Сумма изменена';
    case 'verificationMethod': {
      const method = labelOf(VERIFICATION_OPTIONS, data.verificationMethod);
      return data.verificationMethod === 'verify_bankid' && data.bank ? `${method} — ${labelOf(BANK_OPTIONS, data.bank)}` : method;
    }
    case 'contact':
      return labelOf(CONTACT_OPTIONS, data.contact);
    default:
      return '—';
  }
}

/** «✅ Вопрос: ответ». У самих вариантов ответа ✅ нет, так что галочка не дублируется. */
function recapText(field: keyof ProfileAnswers, data: ProfileData): string {
  return `✅ **${fieldTitle(field, data)}:** ${answerLabel(field, data)}`;
}

function changeVerificationKeyboard(): Keyboard {
  return actionsKeyboard([{ label: CHANGE_VERIFICATION_LABEL, payload: 'change_verification' }]);
}

function backKeyboard(): Keyboard {
  return actionsKeyboard([{ label: BACK_BUTTON_LABEL, payload: 'back' }]);
}

// ---------------------------------------------------------------------------
// Отправка и редактирование сообщений
// ---------------------------------------------------------------------------

async function sendText(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(text, { format: 'markdown' });
}

/** Задаёт вопрос шага. Возвращает id сообщения, только если вопрос потом сворачивается в блок. */
async function ask(ctx: BotContext, step: Step, data: ProfileData): Promise<string | undefined> {
  const view = questionView(step, data);
  const message = await ctx.reply(view.text, {
    format: 'markdown',
    attachments: view.keyboard ? [view.keyboard] : undefined,
  });
  return TRACKED_STEPS.has(step) ? message.body.mid : undefined;
}

/** Редактирование сообщения — некритично: ошибка не должна ломать сценарий. */
async function editMessage(ctx: BotContext, messageId: string | undefined, text: string, keyboard?: Keyboard): Promise<void> {
  if (!messageId) return;
  try {
    await ctx.api.editMessage(messageId, { text, format: 'markdown', attachments: keyboard ? [keyboard] : [] });
  } catch (error) {
    console.error('Не удалось отредактировать сообщение (не критично)', error);
  }
}

/** MAX: не больше двух удалений в секунду в одном диалоге — между удалениями держим паузу. */
const DELETE_INTERVAL_MS = 550;
const lastDeleteAt = new Map<number, number>();

async function throttleDelete(chatId: number | undefined | null): Promise<void> {
  if (chatId == null) return;
  const wait = (lastDeleteAt.get(chatId) ?? 0) + DELETE_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastDeleteAt.set(chatId, Date.now());
}

/**
 * Удаляет сообщение бота. В личном диалоге MAX разрешает удалять только сообщения самого бота.
 * API при отказе может ответить 200 с success: false — такие случаи логируем, сценарий не ломаем.
 */
async function deleteMessage(ctx: BotContext, messageId: string | undefined): Promise<void> {
  if (!messageId) return;
  await throttleDelete(ctx.chatId);
  try {
    const result = await ctx.deleteMessage(messageId);
    if (result && result.success === false) console.error('MAX отказал в удалении сообщения', messageId, result.message);
  } catch (error) {
    console.error('Не удалось удалить сообщение (не критично)', error);
  }
}

async function deleteServiceMessages(ctx: BotContext, data: ProfileData): Promise<void> {
  for (const id of data.serviceMessageIds ?? []) await deleteMessage(ctx, id);
}

/**
 * Сообщение об ошибке ввода. Предыдущее такое сообщение удаляется, чтобы при повторных ошибках
 * в чате висело не больше одного, а id нового запоминается — его удалит `advance` после верного ответа.
 */
async function sendService(ctx: BotContext, data: ProfileData, text: string): Promise<Transition> {
  await deleteServiceMessages(ctx, data);
  const message = await ctx.reply(text);
  return transition.stay({ serviceMessageIds: [message.body.mid] });
}

/** Переход к следующему шагу с уборкой служебных сообщений об ошибках. */
async function advance(ctx: BotContext, data: ProfileData, step: Step, patch: Partial<ProfileData>): Promise<Transition> {
  if (!data.serviceMessageIds?.length) return transition.goto(step, patch);
  await deleteServiceMessages(ctx, data);
  return transition.goto(step, { ...patch, serviceMessageIds: [] });
}

/**
 * Подтверждает нажатие кнопки (убирает спиннер). MAX отклоняет пустое тело `{}` ошибкой 400
 * «message or notification required» — поля нет в типах SDK 0.3.1, поэтому тип приводим вручную.
 * Пустая строка — без всплывающей плашки; непустая — короткая подсказка пользователю.
 */
async function acknowledgeCallback(ctx: BotContext, notification = ''): Promise<void> {
  if (!ctx.has('message_callback')) return;
  try {
    await ctx.answerOnCallback({ notification } as Parameters<BotContext['answerOnCallback']>[0]);
  } catch (error) {
    console.error('Не удалось подтвердить callback (не критично)', error);
  }
}

function readText(ctx: BotContext): string | undefined {
  const text = ctx.message?.body.text?.trim();
  return text && text.length > 0 ? text : undefined;
}

// ---------------------------------------------------------------------------
// Ответ на вопрос-блок
// ---------------------------------------------------------------------------

interface AnswerOptions {
  /** Оставить у свёрнутого блока кнопку «Изменить». На последних вопросах анкеты её нет. */
  back: boolean;
  /** Что сделать между сворачиванием блока и следующим вопросом (промежуточное сообщение, демо-проверка). */
  before?: (ctx: BotContext, updated: ProfileData) => Promise<Partial<ProfileData> | void>;
}

/**
 * Общий путь ответа на вопрос-блок:
 * 1) у предыдущего ответа убирается «Изменить» (кнопка есть только у последнего ответа);
 * 2) текущий вопрос сворачивается в «Вопрос: ответ»;
 * 3) задаётся следующий вопрос.
 */
async function answer(
  ctx: BotContext,
  data: ProfileData,
  field: keyof ProfileAnswers,
  patch: Partial<ProfileData>,
  next: Step,
  options: AnswerOptions,
): Promise<Transition> {
  let updated: ProfileData = { ...data, ...patch };
  if (data.lastAnswered && data.lastAnswered !== field) {
    await editMessage(ctx, data.blockIds?.[data.lastAnswered], recapText(data.lastAnswered, data));
  }
  await editMessage(ctx, data.currentQuestionId, recapText(field, updated), options.back ? backKeyboard() : undefined);
  const extra = (await options.before?.(ctx, updated)) ?? {};
  updated = { ...updated, ...extra };
  const currentQuestionId = await ask(ctx, next, updated);
  return advance(ctx, data, next, {
    ...patch,
    ...extra,
    blockIds: { ...data.blockIds, [field]: data.currentQuestionId },
    lastAnswered: options.back ? field : undefined,
    currentQuestionId,
  });
}

/** Простой вопрос с выбором одного варианта кнопкой. */
function choiceStep(field: keyof ProfileAnswers, next: (data: ProfileData) => Step, extra?: Partial<AnswerOptions>): Step_ {
  return async ({ ctx, state, data }) => {
    const payload = ctx.callback?.payload;
    const option = stepOptions(state.step, data).find((o) => o.id === payload);
    if (!option) return sendService(ctx, data, invalidChoicePrompt());
    await acknowledgeCallback(ctx);
    const patch = { [field]: option.id } as Partial<ProfileData>;
    return answer(ctx, data, field, patch, next({ ...data, ...patch }), { back: true, ...extra });
  };
}

// ---------------------------------------------------------------------------
// Шаги сценария
// ---------------------------------------------------------------------------

const greet: Step_ = async ({ ctx }) => {
  await sendText(ctx, GREETING);
  return transition.goto('await_name');
};

const awaitName: Step_ = async ({ ctx, data }) => {
  const name = readText(ctx);
  if (!name) return sendService(ctx, data, NAME_EMPTY_PROMPT);
  const updated = { ...data, name };
  const currentQuestionId = await ask(ctx, 'await_study_stage', updated);
  return advance(ctx, data, 'await_study_stage', { name, currentQuestionId });
};

type CityAnswer = { city: string; fromGeo: boolean } | { error: string };

/** Город: кнопка быстрого города, геопозиция или текст. */
async function resolveCity(ctx: BotContext): Promise<CityAnswer | undefined> {
  const payload = ctx.callback?.payload;
  if (payload?.startsWith('city:')) {
    await acknowledgeCallback(ctx);
    const known = cityById(payload.slice('city:'.length));
    return known ? { city: known.name, fromGeo: false } : undefined;
  }
  const location = ctx.location;
  if (location) {
    const { city, distanceKm } = nearestCity(location.latitude, location.longitude);
    if (distanceKm > MAX_CITY_DISTANCE_KM) return { error: cityTooFarPrompt(city.name, distanceKm) };
    return { city: city.name, fromGeo: true };
  }
  const text = readText(ctx);
  return text ? { city: text, fromGeo: false } : undefined;
}

const awaitCity: Step_ = async ({ ctx, data }) => {
  const result = await resolveCity(ctx);
  if (!result) return sendService(ctx, data, CITY_EMPTY_PROMPT);
  if ('error' in result) return sendService(ctx, data, result.error);
  return answer(ctx, data, 'city', { city: result.city, cityFromGeo: result.fromGeo }, 'await_field', { back: true });
};

/**
 * «50% пройдено» с кнопкой «Продолжить»: следующий вопрос приходит только по нажатию,
 * а само сообщение удаляется, чтобы в чате оставалась цельная картина ответов.
 * Показывается один раз — после «Изменить» у оплаты анкета идёт сразу к формату работы.
 */
const awaitMidpoint: Step_ = async ({ ctx, data }) => {
  if (ctx.callback?.payload !== 'continue') return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  await deleteMessage(ctx, data.currentQuestionId);
  const currentQuestionId = await ask(ctx, 'await_work_format', data);
  return advance(ctx, data, 'await_work_format', { currentQuestionId, midpointSent: true });
};

/**
 * Корректировка завышенных ожиданий (только трек «Работа»): мало опыта или 1–2 курс,
 * а вилка от 80–150 тыс. и выше. В сценарии условие «Опыта нет», но на треке «Работа»
 * такого варианта нет — ближайший эквивалент «0–1 год».
 */
export function needsSalaryCorrection(data: ProfileData): boolean {
  if (data.goal !== 'job') return false;
  const lowExperience = data.experience === 'exp_0_1' || data.studyStage === 'uni_1_2';
  const highSalary = ['sal_80_150', 'sal_150_300', 'sal_300p'].includes(data.salary ?? '');
  return lowExperience && highSalary;
}

/**
 * Мотивация: ровно два варианта. Выбранный отмечается зелёной галочкой ✅, после второго анкета идёт дальше сама.
 * Повторное нажатие снимает отметку. Последний вопрос анкеты — без «Изменить».
 */
const awaitMotivation: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  const id = payload?.startsWith('multi:') ? payload.slice('multi:'.length) : undefined;
  if (!id || !MOTIVATION_OPTIONS.some((o) => o.id === id)) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);

  const draft = data.motivationDraft ?? [];
  const motivationDraft = draft.includes(id) ? draft.filter((x) => x !== id) : [...draft, id];
  if (motivationDraft.length < MOTIVATION_COUNT) {
    const view = questionView('await_motivation', { ...data, motivationDraft });
    await editMessage(ctx, data.currentQuestionId, view.text, view.keyboard);
    return transition.stay({ motivationDraft });
  }

  const patch: Partial<ProfileData> = { motivation: motivationDraft, motivationDraft: undefined };
  const next: Step = needsSalaryCorrection({ ...data, ...patch }) ? 'await_salary_correction' : 'await_verification';
  return answer(ctx, data, 'motivation', patch, next, { back: false });
};

/**
 * Корректировка ЗП не оставляет следов в конце анкеты: сообщение удаляется в обоих случаях.
 * При «Изменить сумму» новая сумма обновляет только блок с зарплатой в середине анкеты.
 */
async function finishSalaryCorrection(ctx: BotContext, data: ProfileData, patch: Partial<ProfileData>): Promise<Transition> {
  await deleteMessage(ctx, data.currentQuestionId);
  const currentQuestionId = await ask(ctx, 'await_verification', { ...data, ...patch });
  return advance(ctx, data, 'await_verification', { ...patch, currentQuestionId });
}

const awaitSalaryCorrection: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  if (payload === 'keep_salary') {
    await acknowledgeCallback(ctx);
    return finishSalaryCorrection(ctx, data, { salaryRevision: 'keep' });
  }
  if (payload === 'fix_salary') {
    await acknowledgeCallback(ctx);
    const view = questionView('await_salary_fix', data);
    await editMessage(ctx, data.currentQuestionId, view.text, view.keyboard);
    return transition.goto('await_salary_fix');
  }
  return sendService(ctx, data, invalidChoicePrompt());
};

/** Новая сумма (до 150 000 ₽) — меняется только ранний блок с зарплатой. */
const awaitSalaryFix: Step_ = async ({ ctx, data }) => {
  const option = JOB_SALARY_FIX_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  const patch: Partial<ProfileData> = { salary: option.id, salaryRevision: 'changed' };
  await editMessage(ctx, data.blockIds?.salary, recapText('salary', { ...data, ...patch }));
  return finishSalaryCorrection(ctx, data, patch);
};

/** «⏳ Проверяем…» видно только пока идёт проверка, потом сообщение удаляется —
 * итог остаётся одной строкой «✅ Верификация: …». */
async function demoVerify(ctx: BotContext, methodLabel: string): Promise<void> {
  const processing = await ctx.reply(verificationProcessing(methodLabel), { format: 'markdown' });
  await runDemoVerification();
  await deleteMessage(ctx, processing.body.mid);
}

const awaitVerification: Step_ = async ({ ctx, data }) => {
  const option = VERIFICATION_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  const patch: Partial<ProfileData> = { verificationMethod: option.id };
  if (option.id === 'verify_bankid') {
    // Сначала выбор банка — в том же сообщении, где был вопрос о способе.
    const currentQuestionId = await showInPlace(ctx, data, 'await_bank');
    return advance(ctx, data, 'await_bank', { ...patch, currentQuestionId });
  }
  if (option.id === 'verify_manual') {
    // Вопрос о способе превращается в подсказку шага 1; итог «✅ Верификация» появится после данных.
    const currentQuestionId = await showInPlace(ctx, data, 'await_passport');
    return advance(ctx, data, 'await_passport', { ...patch, currentQuestionId });
  }
  return answer(ctx, data, 'verificationMethod', patch, 'await_contact', {
    back: false,
    before: async () => {
      await demoVerify(ctx, option.label);
      return { verified: true };
    },
  });
};

/** Сколько фото или файлов документа в сообщении. Имитация: содержимое не распознаём и не сохраняем. */
function documentPhotoCount(ctx: BotContext): number {
  return ctx.message?.body.attachments?.filter((a) => a.type === 'image' || a.type === 'file').length ?? 0;
}

function hasDocumentPhoto(ctx: BotContext): boolean {
  return documentPhotoCount(ctx) > 0;
}

const PASSPORT_PAGES = 2;

/**
 * Сообщение пользователя с документом запоминаем, чтобы после проверки попробовать удалить.
 * По документации MAX бот в личном диалоге удаляет только свои сообщения — пробуем, отказ логируется.
 */
function withUserMessage(ctx: BotContext, data: ProfileData): string[] {
  return [...(data.manualMessageIds ?? []), ...(ctx.messageId ? [ctx.messageId] : [])];
}

/** Ошибка ввода на шагах ручной проверки. Подсказка — служебное сообщение, уберётся после верного ответа. */
async function manualError(ctx: BotContext, data: ProfileData, text: string, extra: Partial<ProfileData> = {}): Promise<Transition> {
  const shown = await sendService(ctx, data, text);
  return transition.stay({ ...dataOf(shown), manualMessageIds: withUserMessage(ctx, data), ...extra });
}

function dataOf(result: Transition): Partial<ProfileData> {
  return (result as { data?: Partial<ProfileData> }).data ?? {};
}

/** Вход через выбранный банк (имитация), итог: «✅ Верификация: 🏦 Банк ID — Сбер ID». */
const awaitBank: Step_ = async ({ ctx, data }) => {
  const bank = BANK_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!bank) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  return answer(ctx, data, 'verificationMethod', { bank: bank.id }, 'await_contact', {
    back: false,
    before: async () => {
      await demoVerify(ctx, `авторизация через ${bank.label}`);
      return { verified: true };
    },
  });
};

/**
 * Ручная проверка, шаг 1: паспорт обязателен — фото двух разворотов (стр. 2–3 и 4–5, одним
 * сообщением или по очереди) или все данные текстом по шаблону. Подсказка шага — то же сообщение,
 * где был вопрос о способе проверки: оно редактируется, а не копится в чате.
 */
const awaitPassport: Step_ = async ({ ctx, data }) => {
  const photos = (data.passportPhotos ?? 0) + documentPhotoCount(ctx);
  if (photos > 0 && photos < PASSPORT_PAGES) {
    return manualError(ctx, data, MANUAL_PASSPORT_SECOND_PAGE, { passportPhotos: photos });
  }
  if (photos === 0) {
    const missing = missingPassportFields(readText(ctx) ?? '');
    if (missing.length > 0) return manualError(ctx, data, manualPassportMissing(missing));
  }
  const currentQuestionId = await showInPlace(ctx, data, 'await_inn');
  return advance(ctx, data, 'await_inn', {
    currentQuestionId,
    passportProvided: true,
    passportPhotos: undefined,
    manualMessageIds: withUserMessage(ctx, data),
  });
};

/**
 * Ручная проверка, шаг 2: ИНН или СНИЛС — номером или фото. После проверки подсказка шага удаляется,
 * а уже после присланных данных выводится «✅ Верификация: 📝 Паспорт + ИНН / СНИЛС».
 * Сообщения пользователя с документами пробуем удалить — MAX может не позволить, отказ будет в логе.
 */
const awaitInn: Step_ = async ({ ctx, data }) => {
  const text = readText(ctx);
  if (!hasDocumentPhoto(ctx) && !(text && isValidIdFormat(text))) return manualError(ctx, data, MANUAL_ID_INVALID);
  await deleteServiceMessages(ctx, data);
  for (const id of [...withUserMessage(ctx, data), data.currentQuestionId]) await deleteMessage(ctx, id);
  await demoVerify(ctx, 'паспорт + ИНН / СНИЛС');
  const updated: ProfileData = { ...data, verified: true, idDocumentProvided: true };
  await sendText(ctx, recapText('verificationMethod', updated));
  const currentQuestionId = await ask(ctx, 'await_contact', updated);
  return transition.goto('await_contact', {
    verified: true,
    idDocumentProvided: true,
    currentQuestionId,
    manualMessageIds: undefined,
    serviceMessageIds: [],
  });
};

/**
 * Показывает вопрос шага на месте текущего сообщения (редактирует его). Если сообщения уже нет —
 * например, его убрало напоминание, — присылает новое. Возвращает id сообщения с вопросом.
 */
async function showInPlace(ctx: BotContext, data: ProfileData, step: Step): Promise<string | undefined> {
  if (!data.currentQuestionId) return ask(ctx, step, data);
  const view = questionView(step, data);
  await editMessage(ctx, data.currentQuestionId, view.text, view.keyboard);
  return data.currentQuestionId;
}

/** «🔄 Другой способ проверки» на шагах ручной проверки: возвращаемся к выбору способа. */
async function changeVerification(ctx: BotContext, data: ProfileData): Promise<Transition> {
  await acknowledgeCallback(ctx);
  await deleteServiceMessages(ctx, data);
  for (const id of data.manualMessageIds ?? []) await deleteMessage(ctx, id);
  const currentQuestionId = await showInPlace(ctx, data, 'await_verification');
  return transition.goto('await_verification', {
    currentQuestionId,
    verificationMethod: undefined,
    bank: undefined,
    passportProvided: undefined,
    passportPhotos: undefined,
    manualMessageIds: undefined,
    serviceMessageIds: [],
  });
}

/** Только ответы пользователя — служебное состояние диалога в заявку не попадает. */
function profileAnswers(data: ProfileData): ProfileAnswers {
  const { name, studyStage, goal, city, field, experience, employment, salary, workFormat, relocation, overtime, motivation, salaryRevision, verificationMethod, bank, passportProvided, idDocumentProvided, verified, contact } = data;
  return { name, studyStage, goal, city, field, experience, employment, salary, workFormat, relocation, overtime, motivation, salaryRevision, verificationMethod, bank, passportProvided, idDocumentProvided, verified, contact };
}

const awaitContact: Step_ = async ({ ctx, data }) => {
  const option = CONTACT_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  return answer(ctx, data, 'contact', { contact: option.id }, 'await_final_action', {
    back: false,
    before: async (_ctx, updated) => {
      submitProfileMock(ctx.chatId ?? 0, profileAnswers(updated));
      return { completedAt: Date.now() };
    },
  });
};

const PROFILE_FIELDS: Array<keyof ProfileAnswers> = [
  'studyStage',
  'goal',
  'city',
  'field',
  'experience',
  'employment',
  'salary',
  'workFormat',
  'relocation',
  'overtime',
  'motivation',
  'contact',
];

/** Значок строки карточки, если у ответа своего эмодзи нет (зарплата, город, мотивация и т. п.). */
const FIELD_ICONS: Partial<Record<keyof ProfileAnswers, string>> = {
  studyStage: '🎓',
  goal: '🎯',
  city: '📍',
  field: '🧩',
  experience: '🧭',
  employment: '⏱️',
  salary: '📈',
  workFormat: '🏠',
  relocation: '🧳',
  overtime: '🏁',
  motivation: '✨',
  contact: '💬',
};

const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+/u;

/**
 * Строка карточки «эмодзи **Поле:** ответ». Эмодзи ответа (с нажатой кнопки) выносится в начало строки —
 * значки встают ровным столбиком слева, и карточка выглядит выровненной.
 */
function profileLine(field: keyof ProfileAnswers, data: ProfileData): string {
  if (field === 'motivation') {
    // Несколько вариантов — у строки общий значок, эмодзи отдельных вариантов убираем.
    const items = (Array.isArray(data.motivation) ? data.motivation : []).map((id) =>
      labelOf(MOTIVATION_OPTIONS, id).replace(LEADING_EMOJI, ''),
    );
    return `${FIELD_ICONS.motivation} **${fieldTitle(field, data)}:** ${items.join(', ') || '—'}`;
  }
  const answer = answerLabel(field, data);
  const match = answer.match(LEADING_EMOJI);
  const icon = match?.[1] ?? FIELD_ICONS[field] ?? '•';
  const text = match ? answer.slice(match[0].length) : answer;
  return `${icon} **${fieldTitle(field, data)}:** ${text}`;
}

export function profileCard(data: ProfileData): string {
  const status = data.verified ? '✅ подтверждён' : '⏳ не подтверждён';
  const lines = PROFILE_FIELDS.map((field) => profileLine(field, data));
  return `# 🪪 Мой профиль\n\n${fmt.bold(fmt.escape(data.name ?? '—'))} · ${status}\n\n${lines.join('\n')}\n\n${PROFILE_FOOTER}`;
}

const awaitFinalAction: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  if (payload === 'profile') {
    // Кнопка одноразовая: убираем её с финального сообщения, чтобы карточка не дублировалась.
    await editMessage(ctx, ctx.messageId, FINAL_MESSAGE);
    await sendText(ctx, profileCard(data));
    return transition.stay();
  }
  return transition.stay();
};

// ---------------------------------------------------------------------------
// «Изменить» и «Вернуться» из напоминаний
// ---------------------------------------------------------------------------

/**
 * «Изменить» у последнего ответа: текущий вопрос удаляется, свёрнутый блок раскрывается обратно
 * в вопрос с вариантами. После нового ответа блок снова сворачивается, а удалённый вопрос
 * приходит заново — это делает обычный `answer`.
 */
async function goBack(ctx: BotContext, data: ProfileData): Promise<Transition> {
  await acknowledgeCallback(ctx);
  const field = data.lastAnswered;
  const blockId = field ? data.blockIds?.[field] : undefined;
  const step = field ? FIELD_STEP[field] : undefined;
  if (!field || !blockId || !step || ctx.messageId !== blockId) return transition.stay();
  await deleteMessage(ctx, data.currentQuestionId);
  await deleteServiceMessages(ctx, data);
  const view = questionView(step, data);
  await editMessage(ctx, blockId, view.text, view.keyboard);
  return transition.goto(step, {
    currentQuestionId: blockId,
    lastAnswered: undefined,
    motivationDraft: undefined,
    serviceMessageIds: [],
  });
}

/** Кнопка из напоминания: переспрашиваем текущий вопрос внизу чата (старый удаляем). */
async function resume(ctx: BotContext, step: Step, data: ProfileData): Promise<Transition> {
  await acknowledgeCallback(ctx);
  if (step === 'await_final_action') return transition.stay();
  if (!TRACKED_STEPS.has(step)) {
    await ask(ctx, step, data);
    return transition.stay();
  }
  await deleteMessage(ctx, data.currentQuestionId);
  const currentQuestionId = await ask(ctx, step, data);
  return transition.stay({ currentQuestionId });
}

/** Кнопки, которые живут не на сообщении текущего вопроса: у блока, в напоминании, в финале. */
const OWN_MESSAGE_PAYLOADS: ReadonlySet<string> = new Set(['back', 'resume', 'profile', 'change_verification']);

async function intercept(ctx: BotContext, step: Step, data: ProfileData): Promise<Transition | undefined> {
  if (!ctx.has('message_callback')) return undefined;
  const payload = ctx.callback?.payload;
  // Кнопка не из текущего вопроса (двойное нажатие, старое сообщение) — молча подтверждаем, без «выбери вариант».
  if (payload && !OWN_MESSAGE_PAYLOADS.has(payload) && data.currentQuestionId && ctx.messageId && ctx.messageId !== data.currentQuestionId) {
    await acknowledgeCallback(ctx);
    return transition.stay();
  }
  if (payload === 'back') return goBack(ctx, data);
  if (payload === 'resume') return resume(ctx, step, data);
  if (payload === 'change_verification' && (step === 'await_bank' || step === 'await_passport' || step === 'await_inn')) {
    return changeVerification(ctx, data);
  }
  return undefined;
}

export const careerScenario = defineScenario<BotContext, ProfileData>()<Step>({
  id: 'career-navigator',
  initialStep: 'greet',
  // Долгий таймаут: напоминания приходят через 30 минут и через 2 часа, а кнопки финала должны работать и позже.
  idleTimeoutMs: 7 * 24 * 60 * 60 * 1000,
  createData: () => ({}),
  intercept: ({ ctx, state, data }) => intercept(ctx, state.step, data),
  steps: {
    greet,
    await_name: awaitName,
    await_study_stage: choiceStep('studyStage', () => 'await_goal'),
    await_goal: choiceStep('goal', () => 'await_city'),
    await_city: awaitCity,
    await_field: choiceStep('field', () => 'await_experience'),
    await_experience: choiceStep('experience', () => 'await_employment'),
    await_employment: choiceStep('employment', () => 'await_salary'),
    await_salary: choiceStep('salary', (d) => (d.midpointSent ? 'await_work_format' : 'await_midpoint')),
    await_midpoint: awaitMidpoint,
    await_work_format: choiceStep('workFormat', () => 'await_relocation'),
    await_relocation: choiceStep('relocation', () => 'await_overtime'),
    await_overtime: choiceStep('overtime', () => 'await_motivation'),
    await_motivation: awaitMotivation,
    await_salary_correction: awaitSalaryCorrection,
    await_salary_fix: awaitSalaryFix,
    await_verification: awaitVerification,
    await_bank: awaitBank,
    await_passport: awaitPassport,
    await_inn: awaitInn,
    await_contact: awaitContact,
    await_final_action: awaitFinalAction,
  },
});
