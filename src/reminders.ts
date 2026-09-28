import type { Bot, SyncSessionStore } from '@maxhub/max-bot-api';
import { actionsKeyboard } from './keyboards.js';
import type { BotContext, BotSession, ProfileData, Step } from './dialog/types.js';

export type ReminderKind = 'incomplete_30m' | 'incomplete_2h';

const MINUTE = 60 * 1000;
const FIRST_REMINDER_MS = 30 * MINUTE;
const SECOND_REMINDER_MS = 2 * 60 * MINUTE;

/**
 * Какое напоминание пора отправить, если анкета не дозаполнена. Каждое — один раз за период
 * неактивности (любое действие пользователя сбрасывает счётчик). Первое — через 30 минут, второе —
 * через 2 часа; если бот был выключен и первое «проспали», сразу шлём только второе.
 * После финала напоминаний нет.
 */
export function dueReminder(step: Step, data: ProfileData, now: number): ReminderKind | undefined {
  // До согласия на обработку данных не напоминаем: человек ещё не дал согласия на анкету.
  if (step === 'greet' || step === 'await_consent' || step === 'await_final_action' || !data.lastActivityAt) return undefined;
  const sent = data.remindersSent ?? [];
  const elapsed = now - data.lastActivityAt;
  if (elapsed >= SECOND_REMINDER_MS) return sent.includes('incomplete_2h') ? undefined : 'incomplete_2h';
  if (elapsed >= FIRST_REMINDER_MS && !sent.includes('incomplete_30m')) return 'incomplete_30m';
  return undefined;
}

export function reminderMessage(kind: ReminderKind): { text: string; button: string; payload: string } {
  if (kind === 'incomplete_30m') {
    return {
      text:
        '⏳ Пока ты отвлёкся(лась), другие забирают лучшие стажировки и вакансии. Просмотры идут прямо сейчас, и самые крутые предложения достаются тем, кто заполнил анкету первым.\n\n' +
        'До финала всего пара минут — заполни анкету и забирай своё! 🚀',
      button: '▶️ Вернуться и догнать остальных',
      payload: 'resume',
    };
  }
  return {
    text:
      '⏳ Секунду назад твоё место в очереди сдвинулось.\n\n' +
      'Работодатели и госпрограммы выбирают прямо сейчас. Если твоя анкета зависла, самые горячие вакансии уйдут кому-то другому.\n\n' +
      'Осталось совсем немного. Заполни анкету — не упускай свой шанс!',
    button: '▶️ Активировать профиль',
    payload: 'resume',
  };
}

interface IterableSessionStore extends SyncSessionStore<BotSession> {
  keys(): string[];
}

/** Ключ сессии по умолчанию — `<user_id>:<chat_id>`. */
function chatIdFromKey(key: string): number | undefined {
  const chatId = Number(key.split(':')[1]);
  return Number.isFinite(chatId) ? chatId : undefined;
}

export async function sendDueReminders(bot: Bot<BotContext>, store: IterableSessionStore, now = Date.now()): Promise<void> {
  for (const key of store.keys()) {
    const session = store.get(key);
    const scenario = session?.scenario;
    if (!session || !scenario) continue;
    const data = scenario.data as ProfileData;
    const kind = dueReminder(scenario.step as Step, data, now);
    const chatId = chatIdFromKey(key);
    if (!kind || chatId === undefined) continue;
    const message = reminderMessage(kind);

    try {
      await bot.api.sendMessageToChat(chatId, message.text, {
        attachments: [actionsKeyboard([{ label: message.button, payload: message.payload }])],
      });
    } catch (error) {
      console.error('Не удалось отправить напоминание', key, kind, error);
      continue;
    }

    // Анкета не дозаполнена: вопрос без ответа убираем из чата — «Вернуться» задаст его заново внизу.
    // Удаляем только после успешной отправки, иначе человек остался бы и без вопроса, и без напоминания.
    const dropQuestion = data.currentQuestionId;
    if (dropQuestion) {
      try {
        await bot.api.deleteMessage(data.currentQuestionId!);
      } catch (error) {
        console.error('Не удалось удалить вопрос после напоминания (не критично)', key, error);
      }
    }

    // Перечитываем: пока шла отправка, пользователь мог ответить и сессия поменялась.
    const fresh = store.get(key);
    if (!fresh?.scenario) continue;
    const freshData = fresh.scenario.data as ProfileData;
    const patch: Partial<ProfileData> = { remindersSent: [...(freshData.remindersSent ?? []), kind] };
    if (dropQuestion && freshData.currentQuestionId === data.currentQuestionId) patch.currentQuestionId = undefined;
    store.set(key, { ...fresh, scenario: { ...fresh.scenario, data: { ...freshData, ...patch } } });
  }
}

export function startReminders(bot: Bot<BotContext>, store: IterableSessionStore, intervalMs = 30 * 1000): NodeJS.Timeout {
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    sendDueReminders(bot, store)
      .catch((error) => console.error('Ошибка проверки напоминаний', error))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}
