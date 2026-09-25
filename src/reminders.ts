import type { Bot, SyncSessionStore } from '@maxhub/max-bot-api';
import { actionsKeyboard } from './keyboards.js';
import { matchVacancies } from './services/matching.js';
import type { BotContext, BotSession, ProfileData, Step } from './dialog/types.js';

export type ReminderKind = 'incomplete_30m' | 'incomplete_2h' | 'done_30m' | 'done_2h';

const MINUTE = 60 * 1000;
const FIRST_REMINDER_MS = 30 * MINUTE;
const SECOND_REMINDER_MS = 2 * 60 * MINUTE;

/**
 * Какое напоминание пора отправить. Два набора:
 * — анкета не дозаполнена (любой шаг до финала);
 * — профиль готов, но подборку человек так и не открыл.
 * Каждое — один раз за период неактивности (любое действие пользователя сбрасывает счётчик).
 * Первое — через 30 минут бездействия, второе — через 2 часа. Если бот был выключен
 * и первое «проспали», сразу шлём только второе.
 */
export function dueReminder(step: Step, data: ProfileData, now: number): ReminderKind | undefined {
  if (step === 'greet' || !data.lastActivityAt) return undefined;
  const done = step === 'await_final_action';
  if (done && data.offersViewed) return undefined;
  const sent = data.remindersSent ?? [];
  const elapsed = now - data.lastActivityAt;
  const [first, second]: ReminderKind[] = done ? ['done_30m', 'done_2h'] : ['incomplete_30m', 'incomplete_2h'];
  if (elapsed >= SECOND_REMINDER_MS) return sent.includes(second) ? undefined : second;
  if (elapsed >= FIRST_REMINDER_MS && !sent.includes(first)) return first;
  return undefined;
}

export function reminderMessage(kind: ReminderKind, data: ProfileData): { text: string; button: string; payload: string } {
  switch (kind) {
    case 'incomplete_30m':
      return {
        text:
          '⏳ Пока ты отвлёкся(лась), твоё место в очереди просмотров сдвигается.\n\n' +
          'Каждую минуту работодатели и государственные программы смотрят профили тех, кто дошёл до конца. Чем дольше висит незавершённая анкета, тем больше горячих стажировок и вакансий уходит другим ребятам.\n\n' +
          'Осталось совсем немного — не теряй время на старте!',
        button: '▶️ Вернуться и догнать остальных',
        payload: 'resume',
      };
    case 'incomplete_2h': {
      // В исходном тексте «за этот час прошло [X] новых подборок» — данных о новых вакансиях за период
      // у нас нет, поэтому честно подставляем, сколько подходящих демо-подборок уже есть под параметры.
      const count = matchVacancies(data, Number.MAX_SAFE_INTEGER).length;
      const hook =
        count > 0
          ? `🔥 Под твои параметры уже есть ${count} подходящих подборок — а ты их ещё не видишь.`
          : '🔥 Твой профиль всё ещё на паузе.';
      return {
        text:
          `${hook}\n\n` +
          'Ты уже проделал(а) часть пути, но твой цифровой профиль всё ещё не виден компаниям. Пока анкета на паузе — время и реальные предложения просто сгорают.\n\n' +
          'Заверши профиль прямо сейчас, чтобы активировать поиск и не отдавать свои возможности другим!',
        button: '🔥 Активировать профиль',
        payload: 'resume',
      };
    }
    case 'done_30m':
      return {
        text:
          '👀 Твой профиль готов, но ты ещё не посмотрел(а) подборки!\n\n' +
          'Прямо сейчас система подбирает варианты под твои параметры. Зайди на 10 секунд, чтобы увидеть первое совпадение и не заставлять работодателей ждать.',
        button: '📋 Открыть первые варианты',
        payload: 'offers',
      };
    case 'done_2h':
      return {
        text:
          '⏰ Твой готовый профиль простаивает уже два часа.\n\n' +
          'Пока ты вне бота, другие студенты с аналогичным профилем уже получают приглашения и нарабатывают опыт. Не теряй время — проверь, кто прямо сейчас ищет именно тебя!',
        button: '📋 Проверить подборку и статус',
        payload: 'offers',
      };
  }
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
    const message = reminderMessage(kind, data);

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
    const dropQuestion = kind.startsWith('incomplete') && data.currentQuestionId;
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
