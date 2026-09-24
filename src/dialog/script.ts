import { fmt } from '@maxhub/max-bot-api';
import type { Goal } from './types.js';

export interface ChoiceOption {
  id: string;
  label: string;
}

// Подписи на кнопках MAX обрезаются примерно после ~35–40 символов (кнопка растягивается
// на всю ширину, но текст центрируется и режется). Поэтому подписи короткие, а развёрнутые
// пояснения — цитатой в тексте вопроса (там лимит 4000 символов, обрезания нет).
// id вариантов уникальны во всём сценарии.

/** Строка-цитата: оговорки про демо-режим и пояснения к кнопкам. */
export function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export const GREETING =
  `# 👋 Привет!\n\n` +
  'Я бот-помощник по трудоустройству — помогаю студентам и выпускникам находить стажировки и работу.\n\n' +
  'Давай честно: искать работу и стажировки — это куча анкет и звонков. Соберём твой цифровой карьерный профиль за пару минут, чтобы подходящие предложения сами находили тебя.\n\n' +
  'Как тебя зовут?';

export const NAME_QUESTION = 'Как тебя зовут?';
export const NAME_EMPTY_PROMPT = 'Имя не должно быть пустым. Как тебя зовут?';
export const RESTART_HINT = 'Чтобы начать заново в любой момент, напиши /start. Отменить текущий шаг — /cancel.';

// 1. Этап обучения
export const STUDY_STAGE_OPTIONS: ChoiceOption[] = [
  { id: 'college', label: '🏫 Колледж / техникум (СПО)' },
  { id: 'uni_1_2', label: '📘 Вуз, 1–2 курс' },
  { id: 'uni_3_4', label: '📗 Вуз, 3–4 курс / магистратура' },
  { id: 'graduated', label: '🎓 Окончил(а) обучение' },
  { id: 'no_education', label: '⚪ Нет образования' },
];

export function studyStagePrompt(name: string | undefined): string {
  const greeting = name ? `Приятно познакомиться, ${fmt.bold(fmt.escape(name))}!` : 'Приятно познакомиться!';
  return `🎓 ${greeting} На каком ты этапе?`;
}

// 2. Цель (развилка)
export const GOAL_OPTIONS: ChoiceOption[] = [
  { id: 'internship', label: '🎓 Стажировка' },
  { id: 'job', label: '💼 Работа' },
];

export const GOAL_PROMPT = '🎯 Что для тебя сейчас важнее?';

// 3. Город
export const CITY_PROMPT =
  '📍 В каком городе ты сейчас ищешь возможности? Выбери кнопкой, отправь геопозицию или просто напиши название.';

export const CITY_EMPTY_PROMPT = 'Название города не должно быть пустым. Выбери кнопкой, отправь геопозицию или напиши город.';

export function cityTooFarPrompt(nearestName: string, distanceKm: number): string {
  return (
    `Не смог определить город по геопозиции: ближайший из нашей базы — ${nearestName}, но до него ~${Math.round(distanceKm)} км. ` +
    'Напиши свой город текстом.'
  );
}

// 4. Сфера
export const FIELD_OPTIONS: ChoiceOption[] = [
  { id: 'it', label: '💻 IT и разработка' },
  { id: 'engineering', label: '⚙️ Инженерия и производство' },
  { id: 'economics', label: '📊 Экономика и финансы' },
  { id: 'marketing', label: '📣 Маркетинг, PR и медиа' },
  { id: 'service', label: '🤝 Сервис, продажи, логистика' },
  { id: 'humanities', label: '📚 Гуманитарная и соц. сфера' },
  { id: 'law', label: '⚖️ Право и администрирование' },
  { id: 'design', label: '🎨 Дизайн и творчество' },
  { id: 'health', label: '🩺 Медицина и естеств. науки' },
  { id: 'undecided', label: '🔍 Пока не определился(ась)' },
];

export const FIELD_PROMPT =
  '💼 Супер! Какая сфера тебе ближе всего сейчас? Выбери главное направление (профиль всегда можно будет изменить или дополнить).';

// 5. Опыт — ветки расходятся
export const INTERNSHIP_EXPERIENCE_OPTIONS: ChoiceOption[] = [
  { id: 'exp_yes', label: '💪 Да, есть' },
  { id: 'exp_no', label: '🌱 Опыта нет' },
];

export const JOB_EXPERIENCE_OPTIONS: ChoiceOption[] = [
  { id: 'exp_0_1', label: '🌱 0–1 год' },
  { id: 'exp_2_3', label: '📈 2–3 года' },
  { id: 'exp_4_5', label: '💪 4–5 лет' },
  { id: 'exp_5p', label: '🏆 5+ лет' },
];

export function experienceOptions(goal: Goal): ChoiceOption[] {
  return goal === 'internship' ? INTERNSHIP_EXPERIENCE_OPTIONS : JOB_EXPERIENCE_OPTIONS;
}

export function experiencePrompt(goal: Goal): string {
  return goal === 'internship'
    ? '🧭 Подскажи, есть ли у тебя уже практический опыт?'
    : '🧭 Сколько у тебя опыта работы в выбранной сфере?';
}

// 6. Текущая занятость
export const EMPLOYMENT_OPTIONS: ChoiceOption[] = [
  { id: 'free', label: '🆓 Свободен(на)' },
  { id: 'study_10_20h', label: '⏱️ Учусь, 10–20 часов в неделю' },
  { id: 'side_job', label: '🧩 Учусь и подрабатываю' },
  { id: 'full_time', label: '💼 Ищу полную загрузку' },
];

export const EMPLOYMENT_PROMPT =
  '⏰ Понял! Большинство студентов начинают совмещать практику с учёбой уже с первых курсов. А как у тебя сейчас с занятостью?';

// 7. Ожидания по оплате — ветки расходятся
export const INTERNSHIP_PAY_OPTIONS: ChoiceOption[] = [
  { id: 'intern_paid', label: '💰 Только оплачиваемая' },
  { id: 'intern_unpaid', label: '🤝 Можно и без оплаты' },
];

export const JOB_SALARY_OPTIONS: ChoiceOption[] = [
  { id: 'sal_30_50', label: '💵 30 000 – 50 000 ₽ / мес' },
  { id: 'sal_50_80', label: '💶 50 000 – 80 000 ₽ / мес' },
  { id: 'sal_80_150', label: '💷 80 000 – 150 000 ₽ / мес' },
  { id: 'sal_150_300', label: '💰 150 000 – 300 000 ₽ / мес' },
  { id: 'sal_300p', label: '💎 От 300 000 ₽ / мес' },
];

/** Вилки для «Изменить ответ» в блоке корректировки — уже до 150 000 ₽. */
export const JOB_SALARY_FIX_OPTIONS: ChoiceOption[] = JOB_SALARY_OPTIONS.slice(0, 3);

export function salaryOptions(goal: Goal): ChoiceOption[] {
  return goal === 'internship' ? INTERNSHIP_PAY_OPTIONS : JOB_SALARY_OPTIONS;
}

export function salaryTitle(goal: Goal): string {
  return goal === 'internship' ? 'Оплата' : 'Ожидания по зарплате';
}

export function salaryPrompt(goal: Goal): string {
  if (goal === 'internship') {
    return '💰 Рассматриваешь только оплачиваемые стажировки или готов(а) начать и с неоплачиваемой ради опыта?';
  }
  return (
    '💰 На какой доход в месяц рассчитываешь?\n\n' +
    quote('Подсказка: работодатели ценят реальную оценку своего времени и готовность расти вместе с задачами.')
  );
}

// 8. Мотивация к заполнению (середина анкеты)
export const MIDPOINT_MESSAGE =
  `⚡ ${fmt.bold('Ты уже на середине пути! 50% анкеты пройдено.')}\n\n` +
  'Твой цифровой профиль формируется прямо сейчас — осталась пара вопросов, чтобы работодатели и государственные программы поддержки получили точное попадание под твои запросы. Погнали дальше! 🚀';

// 9. Формат работы
export const WORK_FORMAT_OPTIONS: ChoiceOption[] = [
  { id: 'remote', label: '🏠 Удалёнка' },
  { id: 'hybrid', label: '🔀 Гибрид (офис + дом)' },
  { id: 'onsite', label: '🏢 Очно' },
  { id: 'project', label: '📌 Проектная работа' },
];

export const WORK_FORMAT_PROMPT =
  '🏠 Какой формат идеален для твоего текущего расписания?\n\n' +
  quote(
    'Удалёнка — интернет и результат\n' +
      'Гибрид — пара дней в офисе, остальное дома\n' +
      'Очно — на предприятии / в офисе, команда и погружение на месте\n' +
      'Проектная работа — разовые задачи',
  );

// 10. Переезд
export const RELOCATION_OPTIONS: ChoiceOption[] = [
  { id: 'reloc_yes', label: '✈️ Готов(а)' },
  { id: 'reloc_no', label: '🏠 Не готов(а)' },
];

export const RELOCATION_PROMPT = '✈️ Готов(а) к переезду, если найдётся подходящее предложение в другом городе?';

// 11. Переработки
export const OVERTIME_OPTIONS: ChoiceOption[] = [
  { id: 'ready_100', label: '🔥 Готов(а) на все 100%' },
  { id: 'ready_sometimes', label: '⚖️ Изредка, ценю баланс' },
  { id: 'strict_schedule', label: '📅 Строго по графику' },
];

export const OVERTIME_PROMPT =
  '🔥 Проекты бывает нужно сдавать в дедлайны. Как ты относишься к временному усилению нагрузки или овертаймам?\n\n' +
  quote(
    'Готов(а) на все 100% — если это оплачивается или двигает карьеру\n' +
      'Изредка, ценю баланс — иногда подставлю плечо команде, но берегу личное время\n' +
      'Строго по графику — учёба и личное время на первом месте',
  );

// 12. Мотивация — ровно два варианта: после второго анкета идёт дальше сама
export const MOTIVATION_COUNT = 2;

export const MOTIVATION_OPTIONS: ChoiceOption[] = [
  { id: 'pay_now', label: '💸 Оплата сейчас' },
  { id: 'high_income', label: '💰 Высокий доход на старте' },
  { id: 'growth', label: '🚀 Карьерный рост' },
  { id: 'atmosphere', label: '😊 Здоровая атмосфера' },
  { id: 'team', label: '🤝 Крутая команда' },
  { id: 'flexible_schedule', label: '🕊️ Гибкий график' },
  { id: 'official', label: '🏛️ Официальное трудоустройство' },
  { id: 'real_cases', label: '🧪 Реальные кейсы' },
  { id: 'mentor', label: '🧑‍🏫 Сильный наставник' },
  { id: 'remote_or_near', label: '🏠 Удалёнка / рядом с домом' },
  { id: 'skills', label: '📚 Развитие новых навыков' },
  { id: 'big_company', label: '🏢 Опыт в крупной компании' },
];

export function motivationPrompt(selected: number): string {
  return (
    '🚀 Что для тебя станет главным фактором, чтобы сказать работодателю «ДА»?\n\n' +
    `👉 ${fmt.bold('Выбери 2 варианта')} — отмеченные появятся с зелёной галочкой ✅\n\n` +
    `Выбрано: ${fmt.bold(`${selected} из ${MOTIVATION_COUNT}`)}`
  );
}

// 13. Корректировка завышенных ожиданий (только трек «Работа»)
export const SALARY_CORRECTION_PROMPT =
  `📝 ${fmt.bold('Последний вопрос')}\n\n` +
  'Слушай, я бы и сам с радостью поставил тебе такую цифру! Но давай честно: без опыта на старте обычно предлагают от 30 000 до 60 000 ₽ с быстрым ростом после первых проектов.\n\n' +
  'Показывая завышенную планку в начале, ты рискуешь потерять драгоценное время: пока профиль висит без просмотров, другие студенты уже забирают лучшие стажировки и нарабатывают опыт.\n\n' +
  'Давай скорректируем сумму сейчас, чтобы не упускать классные предложения и начать расти в доходе уже сегодня?';

export const SALARY_CORRECTION_OPTIONS: ChoiceOption[] = [
  { id: 'fix_salary', label: '✏️ Изменить ответ' },
  { id: 'keep_salary', label: '➡️ Оставить как есть' },
];

export const SALARY_FIX_PROMPT = '💰 Выбери новую сумму — уже до 150 000 ₽:';

// 14. Верификация (демо)
export const VERIFICATION_OPTIONS: ChoiceOption[] = [
  { id: 'verify_gosuslugi', label: '🏛 Госуслуги (ЕСИА)' },
  { id: 'verify_bankid', label: '🏦 Банк ID (Сбер ID / T-ID)' },
  { id: 'verify_manual', label: '📝 Ручной ввод ИНН / СНИЛС' },
];

export const VERIFICATION_PROMPT =
  '🪪 Твой цифровой трудовой профиль практически готов! Но нам важно подтвердить, что это действительно ты, чтобы работодатели и государственные органы (включая сервисы занятости и Роструд) доверяли твоей анкете и предлагали проверенные офферы.\n\n' +
  'Выбери удобный способ верификации:\n\n' +
  quote('⚠️ Демо-режим: реальная интеграция с Госуслугами, Банк ID и госсервисами в этом MVP не подключена — вход имитируется.');

export const MANUAL_ID_PROMPT =
  '📝 Введи тестовый ИНН (10 или 12 цифр) или СНИЛС (11 цифр). Проверяем только формат, без обращения к госсервисам. Фото документов не нужны.';

export const MANUAL_ID_INVALID = 'Не похоже на ИНН или СНИЛС: нужно 10 или 12 цифр (ИНН) или 11 цифр (СНИЛС). Попробуй ещё раз.';

export function verificationProcessing(methodLabel: string): string {
  return `⏳ Имитируем проверку: ${methodLabel}…`;
}

export const VERIFICATION_SUCCESS = '✅ Профиль подтверждён (демо-режим).';

// 15. Коммуникация и финал
export const CONTACT_OPTIONS: ChoiceOption[] = [
  { id: 'contact_online', label: '💻 Онлайн' },
  { id: 'contact_offline', label: '🤝 Офлайн' },
];

export const CONTACT_PROMPT = '💬 Отлично, данные приняты! Как тебе удобнее держать связь с экспертами нашей карьерной платформы?';

export const FINAL_MESSAGE =
  `# 🚀 Это твоё начало!\n\n` +
  'Твой цифровой трудовой профиль успешно сформирован и внесён в систему. Вся рутина по поиску, фильтрации вакансий и подбору стажировок теперь на нас. Мы уже начинаем сопоставлять твои компетенции с актуальными возможностями.\n\n' +
  'Нажми кнопку ниже, чтобы увидеть свой прогресс и актуальный статус профиля!\n\n' +
  quote('⚠️ Демо-режим: профиль сохранён в тестовую базу, реальной передачи в сервисы занятости и Роструд нет. Подборки — на синтетических данных.');

export const FINAL_BUTTON_PROFILE = 'Открыть мой профиль →';
export const FINAL_BUTTON_OFFERS = '📋 Посмотреть предложения';

export function offersIntro(count: number): string {
  if (count === 0) {
    return '📋 Пока не нашли подходящих демо-предложений под твой профиль. Мы уже работаем над расширением базы!';
  }
  return `📋 ${fmt.bold(`Вот ${count} демо-предложения под твой профиль`)} (тестовые данные):`;
}

export function offerLine(title: string, org: string, city: string, pay: string): string {
  return `• ${fmt.bold(title)} — ${org}, ${city}\n  Оплата: ${fmt.bold(pay)}`;
}

export function invalidChoicePrompt(): string {
  return 'Пожалуйста, выбери один из вариантов кнопкой 👆';
}

export const BACK_BUTTON_LABEL = '✏️ Изменить';
