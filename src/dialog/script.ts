import { fmt } from '@maxhub/max-bot-api';
import type { Goal } from './types.js';

export interface ChoiceOption {
  id: string;
  label: string;
}

export const GOAL_WORD: Record<Goal, { nom: string; gen: string; acc: string }> = {
  internship: { nom: 'стажировка', gen: 'стажировки', acc: 'стажировку' },
  job: { nom: 'работа', gen: 'работы', acc: 'работу' },
};

const TOTAL_STEPS = 10;

/** Заголовок вопроса с эмодзи и индикатором прогресса, например «🎓 Шаг 1 из 10». */
function stepHeader(step: number, emoji: string, title: string): string {
  return `${emoji} ${fmt.bold(`Шаг ${step} из ${TOTAL_STEPS}`)} — ${fmt.bold(title)}`;
}

/** Строка-цитата: визуально выделяет оговорки про демо-режим и легенды к кнопкам. */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** Выделение текста маркером ^^...^^ — для ключевых цифр (процент, количество). */
function highlight(text: string): string {
  return `^^${text}^^`;
}

export const GREETING =
  `# 👋 Привет!\n\n` +
  'Я бот-помощник по трудоустройству — помогаю студентам и выпускникам находить стажировки и первую работу.\n\n' +
  'Давай честно: искать работу и стажировки — это куча анкет и звонков. Соберём твой цифровой карьерный профиль за пару минут, чтобы подходящие предложения сами находили тебя.\n\n' +
  `Как тебя зовут?`;

export const RESTART_HINT = 'Чтобы начать заново в любой момент, напиши /start. Отменить текущий шаг — /cancel.';

export const NAME_EMPTY_PROMPT = 'Имя не должно быть пустым. Как тебя зовут?';

// Подписи на кнопках MAX обрезаются примерно после ~35-40 символов (кнопка
// растягивается на всю ширину экрана, но текст всё равно центрируется и режется).
// Поэтому подписи короткие, а пояснения и «приёмы влияния» из исходного сценария —
// в тексте вопроса (там лимит 4000 символов, обрезания нет).

export const STUDY_STAGE_OPTIONS: ChoiceOption[] = [
  { id: 'college', label: '🏫 Колледж / техникум' },
  { id: 'uni_1_2', label: '📘 Вуз, 1–2 курс' },
  { id: 'uni_3_4', label: '📗 Вуз, 3–4 курс / магистр.' },
  { id: 'graduated', label: '🎓 Уже окончил(а)' },
];

export function studyStagePrompt(name: string): string {
  return `${stepHeader(1, '🎓', 'Этап обучения')}\n\nПриятно познакомиться, ${fmt.bold(fmt.escape(name))}! На каком ты этапе?`;
}

export const GOAL_OPTIONS: ChoiceOption[] = [
  { id: 'internship', label: '🎒 Ищу стажировку' },
  { id: 'job', label: '💼 Ищу работу' },
];

export const GOAL_PROMPT = `${stepHeader(2, '🎯', 'Цель')}\n\nЧто для тебя сейчас важнее?`;

export function cityPrompt(): string {
  return (
    `${stepHeader(3, '📍', 'Город')}\n\n` +
    'В каком городе ты сейчас ищешь возможности?\n\n' +
    'Выбери кнопкой, отправь геопозицию 📍 или просто напиши название.'
  );
}

export const CITY_EDIT_PROMPT = `✏️ ${fmt.bold('Изменить: Город')}\n\nВыбери кнопкой или отправь геопозицию 📍`;

export const CITY_EMPTY_PROMPT = 'Название города не должно быть пустым. Выбери кнопкой, отправь геопозицию или напиши город.';

export function cityTooFarPrompt(nearestName: string, distanceKm: number): string {
  return (
    `Не смог определить город по геопозиции: ближайший из нашей базы — ${nearestName}, но до него ~${Math.round(distanceKm)} км. ` +
    'Напиши свой город текстом.'
  );
}

export function cityRecap(city: string, fromGeo: boolean): string {
  return `✅ ${fmt.bold('Город')}: 📍 ${fmt.escape(city)}${fromGeo ? ' (по геопозиции)' : ''}`;
}

export const FIELD_OPTIONS: ChoiceOption[] = [
  { id: 'it', label: '💻 IT и цифра' },
  { id: 'engineering', label: '⚙️ Инженерия' },
  { id: 'economics', label: '📊 Экономика и аналитика' },
  { id: 'humanities', label: '📚 Гуманитарная сфера' },
  { id: 'service', label: '🤝 Сервис и логистика' },
  { id: 'undecided', label: '🔍 Ещё не определился(ась)' },
];

export function fieldPrompt(goal: Goal): string {
  return `${stepHeader(4, '💼', 'Сфера')}\n\nСупер. Какая сфера тебе ближе всего для ${GOAL_WORD[goal].gen}? (Профиль всегда можно будет дополнить)`;
}

export function interestPrompt(): string {
  return `${stepHeader(5, '✨', 'Интересы')}\n\nА чем конкретно тебе нравится заниматься? Коротко, в свободной форме (например: «собирать сайты», «работать с людьми», «считать бюджеты»).`;
}

export const INTEREST_EMPTY_PROMPT = 'Напиши хотя бы пару слов о том, чем нравится заниматься.';

export const EMPLOYMENT_OPTIONS: ChoiceOption[] = [
  { id: 'free', label: '🆓 Свободен(на), ищу первое' },
  { id: 'study_10_20h', label: '⏱️ 10–20 часов в неделю' },
  { id: 'side_job', label: '🧩 Подрабатываю не по профилю' },
  { id: 'working', label: '💼 Работаю, ищу вариант лучше' },
];

export function employmentPrompt(): string {
  return `${stepHeader(6, '⏰', 'Занятость')}\n\nПонял! Большинство студентов начинают совмещать практику с учёбой уже с первых курсов. А как у тебя сейчас с занятостью?`;
}

export const EMPLOYMENT_FORMAL_OPTIONS: ChoiceOption[] = [
  { id: 'formal', label: '✅ Да, официально' },
  { id: 'informal', label: '⚪ Нет, неофициально' },
];

export const EMPLOYMENT_FORMAL_PROMPT = `📝 ${fmt.bold('Уточнение к шагу 6')}\n\nА текущая занятость оформлена официально?`;

export const SALARY_OPTIONS: ChoiceOption[] = [
  { id: 'to_30k', label: '💵 До 30 000 ₽/мес' },
  { id: '30_50k', label: '💶 30 000–50 000 ₽/мес' },
  { id: '50_80k', label: '💷 50 000–80 000 ₽/мес' },
  { id: 'from_80k', label: '💰 От 80 000 ₽/мес' },
];

export function salaryPrompt(goal: Goal): string {
  const legend = quote(
    '💵 До 30 000 ₽ — старт для гибкого графика и обучения\n' +
      '💶 30 000–50 000 ₽ — базовый уровень для partial-time\n' +
      '💷 50 000–80 000 ₽ — высокая загрузка и база навыков\n' +
      '💰 От 80 000 ₽ — полная занятость или опыт/кейсы',
  );
  return (
    `${stepHeader(7, '💰', 'Ожидания по зарплате')}\n\n` +
    `Какая стартовая планка по доходу для тебя комфортна на этапе входа/${GOAL_WORD[goal].gen}?\n` +
    `Подсказка: работодатели ценят реальную оценку своего времени и готовность расти вместе с задачами.\n\n${legend}`
  );
}

export const WORK_FORMAT_OPTIONS: ChoiceOption[] = [
  { id: 'remote', label: '🏠 Удалёнка' },
  { id: 'hybrid', label: '🔀 Гибрид' },
  { id: 'onsite', label: '🏢 Очно' },
  { id: 'project', label: '📌 Проектная работа' },
];

export const WORK_FORMAT_PROMPT =
  `${stepHeader(8, '🏠', 'Формат работы')}\n\nКакой формат идеален для твоего текущего расписания?\n\n` +
  quote(
    '🏠 Удалёнка — интернет и результат\n' +
      '🔀 Гибрид — пара дней в офисе, остальное дома\n' +
      '🏢 Очно — команда и погружение на месте\n' +
      '📌 Проектная работа — разовые задачи',
  );

export const OVERTIME_OPTIONS: ChoiceOption[] = [
  { id: 'ready_100', label: '🔥 Готов(а) на 100%' },
  { id: 'ready_sometimes', label: '⚖️ Изредка, ценю баланс' },
  { id: 'strict_schedule', label: '📅 Строго по графику' },
];

export const OVERTIME_PROMPT =
  `${stepHeader(9, '🔥', 'Переработки')}\n\nПроекты бывает нужно сдавать в дедлайны. Как ты относишься к временному усилению нагрузки или овертаймам?\n\n` +
  quote(
    '🔥 На 100% — если оплачивается или двигает карьеру\n' +
      '⚖️ Изредка — но ценю баланс\n' +
      '📅 Строго по графику — учёба на первом месте',
  );

export const MOTIVATION_OPTIONS: ChoiceOption[] = [
  { id: 'growth', label: '🚀 Рост и менторство' },
  { id: 'flexible_schedule', label: '🕊️ Гибкий график' },
  { id: 'official_record', label: '🏛️ Официальный стаж' },
  { id: 'pay_now', label: '💸 Оплата сейчас' },
];

export function motivationPrompt(goal: Goal): string {
  const legend = quote(
    '🚀 Рост и менторство\n' +
      '🕊️ Гибкий график без ущерба учёбе\n' +
      '🏛️ Официальный стаж — запись в резюме для государства / госструктур\n' +
      '💸 Хорошая оплата прямо сейчас',
  );
  return `${stepHeader(10, '🚀', 'Мотивация')}\n\nЧто для тебя сейчас станет главным «триггером», чтобы сказать работодателю «ДА» на ${GOAL_WORD[goal].acc}?\n\n${legend}`;
}

export function invalidChoicePrompt(): string {
  return 'Пожалуйста, выбери один из вариантов кнопкой ниже 👇';
}

export function finalSummary(profileCompletePercent: number, offersCount: number): string {
  return (
    `# 🏁 Готово!\n\n` +
    `Твой цифровой карьерный профиль сформирован на ${highlight(`${profileCompletePercent}%`)}.\n\n` +
    `Мы подставили твои параметры в базу: прямо сейчас для тебя доступно ${highlight(String(offersCount))} демо-подборок ` +
    `(стажировки, конкурсы и стартовые вакансии).\n\n` +
    `${quote('⚠️ Демо-режим: подборки основаны на тестовом синтетическом наборе данных, а не на реальной базе вакансий.')}\n\n` +
    `Чтобы профиль получил статус «Проверенный кандидат», подтверди верификацию (демо через тестовый ID-провайдер, ` +
    `в проде — вход через Госуслуги). Либо сразу посмотри доступные предложения.`
  );
}

export const FINAL_BUTTON_VERIFY = '🪪 Верификация (демо)';
export const FINAL_BUTTON_OFFERS = '📋 Доступные предложения';

export const VERIFY_INN_PROMPT =
  `🪪 ${fmt.bold('Демо-верификация')}\n\n` +
  `${quote('⚠️ Реальная интеграция с Госуслугами/ЕСИА в этом MVP не подключена.')}\n\n` +
  'Введи тестовый ИНН (10 или 12 цифр) — мы проверим только формат, без обращения к реальным госсервисам.';

export const VERIFY_INN_INVALID = 'Это не похоже на ИНН: нужно 10 или 12 цифр. Попробуй ещё раз.';

export const VERIFY_PROCESSING = '⏳ Выполняем демо-проверку через тестовый ID-провайдер...';

export function verifySuccess(): string {
  return (
    `✅ ${fmt.bold('Профиль верифицирован (демо-режим)')}. В реальной интеграции это был бы вход через Госуслуги ID.\n\n` +
    `${quote('📤 Анкета «отправлена» в демо-базу биржи труда и демо-профиль для Роструда (локальная тестовая запись, без реального обращения к государственным системам).')}\n\n` +
    'Спасибо! Когда появятся реальные подборки — мы дадим знать.'
  );
}

export function offersIntro(count: number): string {
  if (count === 0) {
    return '📋 Пока не нашли подходящих демо-предложений под твой профиль. Мы уже работаем над расширением базы!';
  }
  return `📋 ${fmt.bold(`Вот ${count} демо-предложения под твой профиль`)} (тестовые данные):`;
}

export function offerLine(title: string, org: string, city: string, pay: string): string {
  return `• ${fmt.bold(title)} — ${org}, ${city}\n  Оплата: ${fmt.bold(pay)}`;
}
