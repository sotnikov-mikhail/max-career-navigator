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

/** Строка-цитата: подсказки и пояснения к кнопкам. */
export function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export const GREETING =
  `# 👋 Привет!\n\n` +
  'Я помогу тебе прокачать карьеру.\n\n' +
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
  { id: 'hours_lt_10', label: '⏱️ До 10 часов' },
  { id: 'hours_10_20', label: '🕐 10–20 часов' },
  { id: 'hours_20_30', label: '🕒 20–30 часов' },
  { id: 'full_time', label: '💼 Полная занятость' },
  { id: 'hours_unknown', label: '🤔 Пока не знаю' },
];

export const EMPLOYMENT_PROMPT =
  '⏰ Понял! Большинство студентов начинают совмещать практику с учёбой уже с первых курсов. Сколько времени в неделю ты готов(а) уделять работе или стажировке?';

// 7. Ожидания по оплате — ветки расходятся
export const INTERNSHIP_PAY_OPTIONS: ChoiceOption[] = [
  { id: 'intern_paid', label: '💰 Оплачиваемая' },
  { id: 'intern_unpaid', label: '🤝 Без оплаты' },
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
  'Твой цифровой профиль формируется прямо сейчас — осталась пара вопросов, чтобы работодатели и государственные программы поддержки лучше понимали твои запросы 🚀';

export const MIDPOINT_CONTINUE_LABEL = '▶️ Продолжить';

// 9. Формат занятости
export const WORK_FORMAT_OPTIONS: ChoiceOption[] = [
  { id: 'remote', label: '🏠 Удалёнка' },
  { id: 'hybrid', label: '🔀 Гибрид (офис + дом)' },
  { id: 'onsite', label: '🏢 Очно' },
  { id: 'project', label: '📌 Проектная работа' },
];

export const WORK_FORMAT_PROMPT =
  '🏠 Какой формат занятости идеален для твоего текущего расписания?\n\n' +
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

// 11. Переработки и жёсткие сроки
export const OVERTIME_OPTIONS: ChoiceOption[] = [
  { id: 'ready_100', label: '🔥 Готов(а) на все 100%' },
  { id: 'ready_sometimes', label: '⚖️ Изредка, ценю баланс' },
  { id: 'strict_schedule', label: '📅 Строго по графику' },
];

export const OVERTIME_PROMPT =
  '🔥 Перед сдачей проекта нагрузка иногда растёт. Как ты к этому относишься?\n\n' +
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

// 14. Верификация
export const VERIFICATION_OPTIONS: ChoiceOption[] = [
  { id: 'verify_gosuslugi', label: '🏛 Госуслуги (ЕСИА)' },
  { id: 'verify_bankid', label: '🏦 Банк ID' },
  { id: 'verify_manual', label: '📝 Паспорт + ИНН / СНИЛС' },
];

export const VERIFICATION_PROMPT =
  '🪪 Твой цифровой трудовой профиль практически готов! Но нам важно подтвердить, что это действительно ты, чтобы работодатели и государственные органы (включая сервисы занятости и Роструд) доверяли твоей анкете и предлагали проверенные офферы.\n\n' +
  'Выбери удобный способ верификации:';

export const MANUAL_PASSPORT_PROMPT =
  `🛂 Шаг 1 из 2 — ${fmt.bold('паспорт')}\n\n` +
  `📸 ${fmt.bold('Быстрее всего — отправь фото двух разворотов:')}\n` +
  '📄 стр. 2–3 — с фотографией\n' +
  '🏠 стр. 4–5 — с пропиской\n\n' +
  '✍️ Или напиши данные одним сообщением по шаблону:\n\n' +
  quote(
    'Серия и номер:\n' +
      'Кем выдан:\n' +
      'Дата выдачи:\n' +
      'Код подразделения:\n' +
      'Дата рождения:\n' +
      'Место рождения:\n' +
      'Адрес регистрации:',
  );

export const MANUAL_PASSPORT_SECOND_PAGE = '✅ Разворот 2–3 получен. Теперь отправь стр. 4–5 — с пропиской.';

export function manualPassportMissing(missing: string[]): string {
  return `Не хватает данных: ${missing.join(', ')}. Допиши их одним сообщением или просто отправь фото разворотов — так быстрее 📸`;
}

export const MANUAL_ID_PROMPT =
  `📝 Шаг 2 из 2 — ${fmt.bold('один документ на выбор')}\n\n` +
  '• ИНН\n' +
  '• СНИЛС\n\n' +
  'Напиши номер или отправь фото документа.';

export const MANUAL_ID_INVALID = 'Не похоже на номер ИНН или СНИЛС. Проверь номер или отправь фото документа 📸';

export const CHANGE_VERIFICATION_LABEL = '🔄 Другой способ проверки';

export const BANK_OPTIONS: ChoiceOption[] = [
  { id: 'bank_sber', label: 'Сбер ID' },
  { id: 'bank_tbank', label: 'Т-ID' },
  { id: 'bank_vtb', label: 'ВТБ ID' },
  { id: 'bank_alfa', label: 'Альфа ID' },
  { id: 'bank_gpb', label: 'Газпромбанк ID' },
];

export const BANK_PROMPT = '🏦 Выбери банк, через который войдёшь:';

export function verificationProcessing(methodLabel: string): string {
  return `⏳ Проверяем: ${methodLabel}…`;
}


// 15. Коммуникация и финал
export const CONTACT_OPTIONS: ChoiceOption[] = [
  { id: 'contact_online', label: '💻 Онлайн' },
  { id: 'contact_offline', label: '🤝 Офлайн' },
];

export const CONTACT_PROMPT = '💬 Отлично, данные приняты! Как тебе удобнее держать связь с экспертами нашей карьерной платформы?';

export const FINAL_MESSAGE =
  `# 🚀 Это твоё начало!\n\n` +
  'Твой цифровой трудовой профиль успешно сформирован и внесён в систему. Вся рутина по поиску, фильтрации вакансий и подбору стажировок теперь на нас. Мы уже начинаем сопоставлять твои компетенции с актуальными возможностями.\n\n' +
  'Нажми кнопку ниже, чтобы увидеть свой прогресс и актуальный статус профиля!';

export const FINAL_BUTTON_PROFILE = 'Открыть мой профиль →';

export function invalidChoicePrompt(): string {
  return 'Пожалуйста, выбери один из вариантов кнопкой 👆';
}

export const BACK_BUTTON_LABEL = '✏️ Изменить';
