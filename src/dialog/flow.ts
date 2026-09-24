import { defineScenario, transition, type ScenarioStep } from '@maxhub/max-bot-api';
import { actionsKeyboard, autoKeyboard, choiceKeyboard, cityKeyboard, multiKeyboard } from '../keyboards.js';
import { matchVacancies, type Vacancy } from '../services/matching.js';
import { isValidIdFormat, runDemoVerification } from '../services/verification.js';
import { submitToLaborExchangeMock } from '../services/laborExchangeMock.js';
import { KNOWN_CITIES, MAX_CITY_DISTANCE_KM, cityById, nearestCity } from '../services/geo.js';
import type { BotContext, Goal, ProfileAnswers, ProfileData, Step } from './types.js';
import {
  BACK_BUTTON_LABEL,
  CITY_EMPTY_PROMPT,
  CITY_PROMPT,
  CONTACT_OPTIONS,
  CONTACT_PROMPT,
  EMPLOYMENT_OPTIONS,
  EMPLOYMENT_PROMPT,
  FIELD_OPTIONS,
  FIELD_PROMPT,
  FINAL_BUTTON_OFFERS,
  FINAL_BUTTON_PROFILE,
  FINAL_MESSAGE,
  GOAL_OPTIONS,
  GOAL_PROMPT,
  GREETING,
  JOB_SALARY_FIX_OPTIONS,
  MANUAL_ID_INVALID,
  MANUAL_ID_PROMPT,
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
  VERIFICATION_SUCCESS,
  WORK_FORMAT_OPTIONS,
  WORK_FORMAT_PROMPT,
  cityTooFarPrompt,
  experienceOptions,
  experiencePrompt,
  invalidChoicePrompt,
  motivationPrompt,
  offerLine,
  offersIntro,
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
  'await_contact',
]);

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
      // Столбиком: в половину ширины «Оставить как есть» обрезается.
      return { text: SALARY_CORRECTION_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_salary_fix':
      return { text: SALARY_FIX_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_verification':
      return { text: VERIFICATION_PROMPT, keyboard: choiceKeyboard(options) };
    case 'await_inn':
      return { text: MANUAL_ID_PROMPT };
    case 'await_contact':
      return { text: CONTACT_PROMPT, keyboard: autoKeyboard(options) };
    case 'await_final_action':
      return {
        text: FINAL_MESSAGE,
        keyboard: actionsKeyboard([
          { label: FINAL_BUTTON_PROFILE, payload: 'profile' },
          { label: FINAL_BUTTON_OFFERS, payload: 'offers' },
        ]),
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
  employment: 'Занятость',
  workFormat: 'Формат работы',
  relocation: 'Переезд',
  overtime: 'Переработки',
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
    case 'verificationMethod':
      return labelOf(VERIFICATION_OPTIONS, data.verificationMethod);
    case 'contact':
      return labelOf(CONTACT_OPTIONS, data.contact);
    default:
      return '—';
  }
}

/** «Вопрос: ответ» без галочки — у вариантов ответа и так есть свои значки. */
function recapText(field: keyof ProfileAnswers, data: ProfileData): string {
  return `**${fieldTitle(field, data)}:** ${answerLabel(field, data)}`;
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
  return BLOCK_STEPS.has(step) ? message.body.mid : undefined;
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

async function deleteMessage(ctx: BotContext, messageId: string | undefined): Promise<void> {
  if (!messageId) return;
  try {
    await ctx.deleteMessage(messageId);
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

const MIDPOINT_PAUSE_MS = 3500;

/** После оплаты — промежуточное сообщение «50% пройдено» (один раз, при «Изменить» не повторяется). */
async function sendMidpoint(ctx: BotContext, data: ProfileData): Promise<Partial<ProfileData>> {
  if (data.midpointSent) return {};
  await sendText(ctx, MIDPOINT_MESSAGE);
  // Пауза, чтобы сообщение успели прочитать до следующего вопроса — иначе оно теряется в чате.
  await new Promise((resolve) => setTimeout(resolve, MIDPOINT_PAUSE_MS));
  return { midpointSent: true };
}

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

const awaitSalaryCorrection: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  if (payload === 'keep_salary') {
    await acknowledgeCallback(ctx);
    return answer(ctx, data, 'salaryRevision', { salaryRevision: 'keep' }, 'await_verification', { back: false });
  }
  if (payload === 'fix_salary') {
    await acknowledgeCallback(ctx);
    const view = questionView('await_salary_fix', data);
    await editMessage(ctx, data.currentQuestionId, view.text, view.keyboard);
    return transition.goto('await_salary_fix');
  }
  return sendService(ctx, data, invalidChoicePrompt());
};

/** Новая сумма (до 150 000 ₽): обновляем и этот блок, и ранний блок с зарплатой выше по чату. */
const awaitSalaryFix: Step_ = async ({ ctx, data }) => {
  const option = JOB_SALARY_FIX_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  const patch: Partial<ProfileData> = { salary: option.id, salaryRevision: 'changed' };
  await editMessage(ctx, data.blockIds?.salary, recapText('salary', { ...data, ...patch }));
  return answer(ctx, data, 'salary', patch, 'await_verification', { back: false });
};

async function demoVerify(ctx: BotContext, methodLabel: string): Promise<void> {
  await sendText(ctx, verificationProcessing(methodLabel));
  await runDemoVerification();
  await sendText(ctx, VERIFICATION_SUCCESS);
}

const awaitVerification: Step_ = async ({ ctx, data }) => {
  const option = VERIFICATION_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  const patch: Partial<ProfileData> = { verificationMethod: option.id };
  if (option.id === 'verify_manual') {
    return answer(ctx, data, 'verificationMethod', patch, 'await_inn', { back: false });
  }
  return answer(ctx, data, 'verificationMethod', patch, 'await_contact', {
    back: false,
    before: async () => {
      await demoVerify(ctx, option.label);
      return { verified: true };
    },
  });
};

const awaitInn: Step_ = async ({ ctx, data }) => {
  const id = readText(ctx);
  if (!id || !isValidIdFormat(id)) return sendService(ctx, data, MANUAL_ID_INVALID);
  await deleteServiceMessages(ctx, data);
  await demoVerify(ctx, 'формат ИНН / СНИЛС');
  const updated = { ...data, verified: true };
  const currentQuestionId = await ask(ctx, 'await_contact', updated);
  return transition.goto('await_contact', { verified: true, currentQuestionId, serviceMessageIds: [] });
};

/** Только ответы пользователя — служебное состояние диалога в заявку не попадает. */
function profileAnswers(data: ProfileData): ProfileAnswers {
  const { name, studyStage, goal, city, field, experience, employment, salary, workFormat, relocation, overtime, motivation, salaryRevision, verificationMethod, verified, contact } = data;
  return { name, studyStage, goal, city, field, experience, employment, salary, workFormat, relocation, overtime, motivation, salaryRevision, verificationMethod, verified, contact };
}

const awaitContact: Step_ = async ({ ctx, data }) => {
  const option = CONTACT_OPTIONS.find((o) => o.id === ctx.callback?.payload);
  if (!option) return sendService(ctx, data, invalidChoicePrompt());
  await acknowledgeCallback(ctx);
  return answer(ctx, data, 'contact', { contact: option.id }, 'await_final_action', {
    back: false,
    before: async (_ctx, updated) => {
      submitToLaborExchangeMock(ctx.chatId ?? 0, profileAnswers(updated));
      return { completedAt: Date.now() };
    },
  });
};

export async function sendOffers(ctx: BotContext, data: ProfileData): Promise<void> {
  const offers = matchVacancies(data);
  const lines = offers.map((o: Vacancy) => offerLine(o.title, o.org, o.city, o.pay)).join('\n');
  await sendText(ctx, lines ? `${offersIntro(offers.length)}\n\n${lines}` : offersIntro(0));
}

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

export function profileCard(data: ProfileData): string {
  const lines = PROFILE_FIELDS.map((field) => `**${fieldTitle(field, data)}:** ${answerLabel(field, data)}`);
  const status = data.verified ? '✅ подтверждён (демо)' : '⏳ не подтверждён';
  return `# 🪪 Мой профиль\n\n**Имя:** ${data.name ?? '—'}\n${lines.join('\n')}\n\n**Статус:** ${status}`;
}

const awaitFinalAction: Step_ = async ({ ctx, data }) => {
  const payload = ctx.callback?.payload;
  await acknowledgeCallback(ctx);
  if (payload === 'profile') {
    await sendText(ctx, profileCard(data));
    return transition.stay();
  }
  if (payload === 'offers') {
    await sendOffers(ctx, data);
    return transition.stay({ offersViewed: true });
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

/** Кнопка из напоминания: переспрашиваем текущий вопрос внизу чата (старый удаляем) или показываем подборку. */
async function resume(ctx: BotContext, step: Step, data: ProfileData): Promise<Transition> {
  await acknowledgeCallback(ctx);
  if (step === 'await_final_action') {
    await sendOffers(ctx, data);
    return transition.stay({ offersViewed: true });
  }
  if (!BLOCK_STEPS.has(step)) {
    await ask(ctx, step, data);
    return transition.stay();
  }
  await deleteMessage(ctx, data.currentQuestionId);
  const currentQuestionId = await ask(ctx, step, data);
  return transition.stay({ currentQuestionId });
}

async function intercept(ctx: BotContext, step: Step, data: ProfileData): Promise<Transition | undefined> {
  if (!ctx.has('message_callback')) return undefined;
  const payload = ctx.callback?.payload;
  if (payload === 'back') return goBack(ctx, data);
  if (payload === 'resume') return resume(ctx, step, data);
  if (payload === 'offers' && step !== 'await_final_action') {
    await acknowledgeCallback(ctx);
    await sendOffers(ctx, data);
    return transition.stay({ offersViewed: true });
  }
  return undefined;
}

export const careerScenario = defineScenario<BotContext, ProfileData>()<Step>({
  id: 'career-navigator',
  initialStep: 'greet',
  // Долгий таймаут: напоминания приходят через 3 минуты и через час, а кнопки финала должны работать и позже.
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
    await_salary: choiceStep('salary', () => 'await_work_format', { before: sendMidpoint }),
    await_work_format: choiceStep('workFormat', () => 'await_relocation'),
    await_relocation: choiceStep('relocation', () => 'await_overtime'),
    await_overtime: choiceStep('overtime', () => 'await_motivation'),
    await_motivation: awaitMotivation,
    await_salary_correction: awaitSalaryCorrection,
    await_salary_fix: awaitSalaryFix,
    await_verification: awaitVerification,
    await_inn: awaitInn,
    await_contact: awaitContact,
    await_final_action: awaitFinalAction,
  },
});
