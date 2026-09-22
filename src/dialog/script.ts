import type { Goal } from './types.js';

export interface ChoiceOption {
  id: string;
  label: string;
}

export const GOAL_WORD: Record<Goal, { nom: string; gen: string; acc: string }> = {
  internship: { nom: 'стажировка', gen: 'стажировки', acc: 'стажировку' },
  job: { nom: 'работа', gen: 'работы', acc: 'работу' },
};

export const GREETING =
  'Привет! Я бот-помощник по трудоустройству — помогаю студентам и выпускникам находить стажировки и первую работу.\n\n' +
  'Давай честно: искать работу и стажировки — это куча анкет и звонков. Соберём твой цифровой карьерный профиль за пару минут, чтобы подходящие предложения сами находили тебя.\n\n' +
  'Как тебя зовут?';

export const RESTART_HINT = 'Чтобы начать заново в любой момент, напиши /start. Отменить текущий шаг — /cancel.';

export const NAME_EMPTY_PROMPT = 'Имя не должно быть пустым. Как тебя зовут?';

export const STUDY_STAGE_OPTIONS: ChoiceOption[] = [
  { id: 'college', label: 'Учусь в колледже / техникуме' },
  { id: 'uni_1_2', label: 'Учусь в вузе (1–2 курс)' },
  { id: 'uni_3_4', label: 'Учусь в вузе (3–4 курс или магистратура)' },
  { id: 'graduated', label: 'Уже окончил(а) обучение' },
];

export function studyStagePrompt(name: string): string {
  return `Приятно познакомиться, ${name}! На каком ты этапе?`;
}

export const GOAL_OPTIONS: ChoiceOption[] = [
  { id: 'internship', label: 'Ищу стажировку' },
  { id: 'job', label: 'Ищу работу' },
];

export const GOAL_PROMPT = 'Что для тебя сейчас важнее?';

export function cityPrompt(): string {
  return 'В каком городе ты сейчас ищешь возможности? (Напиши название города)';
}

export const CITY_EMPTY_PROMPT = 'Название города не должно быть пустым. В каком ты городе?';

export const FIELD_OPTIONS: ChoiceOption[] = [
  { id: 'it', label: 'IT и цифровые технологии' },
  { id: 'engineering', label: 'Инженерия и производство' },
  { id: 'economics', label: 'Экономика, управление и аналитика' },
  { id: 'humanities', label: 'Гуманитарная, социальная или педагогическая' },
  { id: 'service', label: 'Сервис, логистика и работа с людьми' },
  { id: 'undecided', label: 'Пока не определился(ась) — хочу попробовать разное' },
];

export function fieldPrompt(goal: Goal): string {
  return `Супер. Какая сфера тебе ближе всего для ${GOAL_WORD[goal].gen}? (Профиль всегда можно будет дополнить)`;
}

export const INTEREST_PROMPT =
  'А чем конкретно тебе нравится заниматься? Коротко, в свободной форме (например: «собирать сайты», «работать с людьми», «считать бюджеты»).';

export const INTEREST_EMPTY_PROMPT = 'Напиши хотя бы пару слов о том, чем нравится заниматься.';

export const EMPLOYMENT_OPTIONS: ChoiceOption[] = [
  { id: 'free', label: 'Свободен(на) и ищу первые проекты / стажировку' },
  { id: 'study_10_20h', label: 'Учусь, но могу выделять 10–20 часов в неделю' },
  { id: 'side_job', label: 'Учусь и уже подрабатываю не по специальности' },
  { id: 'working', label: 'Работаю по специальности, но ищу вариант получше' },
];

export function employmentPrompt(): string {
  return 'Понял! Большинство студентов начинают совмещать практику с учёбой уже с первых курсов. А как у тебя сейчас с занятостью?';
}

export const EMPLOYMENT_FORMAL_OPTIONS: ChoiceOption[] = [
  { id: 'formal', label: 'Да, оформлено официально' },
  { id: 'informal', label: 'Нет, подрабатываю неофициально' },
];

export const EMPLOYMENT_FORMAL_PROMPT = 'А текущая занятость оформлена официально?';

export const SALARY_OPTIONS: ChoiceOption[] = [
  { id: 'to_30k', label: 'До 30 000 ₽ / мес (отличный старт для гибкого графика и обучения)' },
  { id: '30_50k', label: '30 000 – 50 000 ₽ / мес (базовый уровень для регулярной partial-time работы)' },
  { id: '50_80k', label: '50 000 – 80 000 ₽ / мес (требует готовности к высокой загрузке и базе навыков)' },
  { id: 'from_80k', label: 'От 80 000 ₽ / мес (доступно при полной занятости или наличии опыта/кейсов)' },
];

export function salaryPrompt(goal: Goal): string {
  return `Какая стартовая планка по доходу для тебя комфортна на этапе входа/${GOAL_WORD[goal].gen}?\nПодсказка: работодатели ценят реальную оценку своего времени и готовность расти вместе с задачами.`;
}

export const WORK_FORMAT_OPTIONS: ChoiceOption[] = [
  { id: 'remote', label: 'Удалёнка (главное — интернет и результат)' },
  { id: 'hybrid', label: 'Гибрид (пара дней в офисе/на предприятии, остальное дома)' },
  { id: 'onsite', label: 'Очно (хочу видеть команду и погружаться на месте)' },
  { id: 'project', label: 'Проектная работа / разовые задачи' },
];

export const WORK_FORMAT_PROMPT = 'Какой формат идеален для твоего текущего расписания?';

export const OVERTIME_OPTIONS: ChoiceOption[] = [
  { id: 'ready_100', label: 'Готов(а) выкладываться на 100%, если это оплачивается или двигает карьеру' },
  { id: 'ready_sometimes', label: 'Готов(а) изредка подставить плечо команде, но ценю баланс' },
  { id: 'strict_schedule', label: 'Строго по графику: учёба на первом месте' },
];

export const OVERTIME_PROMPT =
  'Проекты бывает нужно сдавать в дедлайны. Как ты относишься к временному усилению нагрузки или овертаймам?';

export const MOTIVATION_OPTIONS: ChoiceOption[] = [
  { id: 'growth', label: 'Быстрый карьерный рост и менторство' },
  { id: 'flexible_schedule', label: 'Гибкий график без ущерба учёбе' },
  { id: 'official_record', label: 'Официальный стаж и запись в резюме для государства / госструктур' },
  { id: 'pay_now', label: 'Хорошая оплата прямо сейчас' },
];

export function motivationPrompt(goal: Goal): string {
  return `Что для тебя сейчас станет главным «триггером», чтобы сказать работодателю «ДА» на ${GOAL_WORD[goal].acc}?`;
}

export function invalidChoicePrompt(): string {
  return 'Пожалуйста, выбери один из вариантов кнопкой ниже 👇';
}

export function finalSummary(profileCompletePercent: number, offersCount: number): string {
  return (
    `Отлично! Твой цифровой карьерный профиль сформирован на ${profileCompletePercent}%.\n\n` +
    `Мы подставили твои параметры в базу: прямо сейчас для тебя доступно ${offersCount} демо-подборок ` +
    `(стажировки, конкурсы и стартовые вакансии).\n\n` +
    `⚠️ Демо-режим: подборки основаны на тестовом синтетическом наборе данных, а не на реальной базе вакансий.\n\n` +
    `Чтобы профиль получил статус «Проверенный кандидат», подтверди верификацию (демо через тестовый ID-провайдер, ` +
    `в проде — вход через Госуслуги). Либо сразу посмотри доступные предложения.`
  );
}

export const FINAL_BUTTON_VERIFY = 'Пройти верификацию (демо)';
export const FINAL_BUTTON_OFFERS = 'Посмотреть доступные предложения';

export const VERIFY_INN_PROMPT =
  '⚠️ Демонстрационный режим верификации: реальная интеграция с Госуслугами/ЕСИА в этом MVP не подключена.\n\n' +
  'Введи тестовый ИНН (10 или 12 цифр) — мы проверим только формат, без обращения к реальным госсервисам.';

export const VERIFY_INN_INVALID = 'Это не похоже на ИНН: нужно 10 или 12 цифр. Попробуй ещё раз.';

export const VERIFY_PROCESSING = '⏳ Выполняем демо-проверку через тестовый ID-провайдер...';

export function verifySuccess(): string {
  return (
    '✅ Профиль верифицирован (демо-режим). В реальной интеграции это был бы вход через Госуслуги ID.\n\n' +
    '📤 Анкета «отправлена» в демо-базу биржи труда и демо-профиль для Роструда (локальная тестовая запись, ' +
    'без реального обращения к государственным системам).\n\n' +
    'Спасибо! Когда появятся реальные подборки — мы дадим знать.'
  );
}

export function offersIntro(count: number): string {
  if (count === 0) {
    return 'Пока не нашли подходящих демо-предложений под твой профиль. Мы уже работаем над расширением базы!';
  }
  return `Вот ${count} демо-предложения под твой профиль (тестовые данные):`;
}

export function offerLine(title: string, org: string, city: string, pay: string): string {
  return `• ${title} — ${org}, ${city}\n  Оплата: ${pay}`;
}
