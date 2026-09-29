import type { ScenarioEngine } from '@maxhub/max-bot-api';
import { careerScenario, cleanupInBackground } from './dialog/flow.js';
import type { BotContext, ProfileData } from './dialog/types.js';

/**
 * В анкету попадают только действия пользователя: сообщение и нажатие кнопки. Служебные события MAX
 * (очистка или удаление чата, mute, правка или удаление сообщения) не должны вызывать ответ бота —
 * иначе бот сам пишет в пустой чат «Имя не должно быть пустым», и кнопка «Начать» пропадает без нажатия.
 */
const USER_ACTIONS: ReadonlySet<string> = new Set(['message_created', 'message_callback']);

export async function userActionsOnly(ctx: { updateType: string }, next: () => Promise<unknown>): Promise<void> {
  if (USER_ACTIONS.has(ctx.updateType)) await next();
}

/**
 * Шаблон команды для `bot.command`. Строковый триггер SDK совпадает только со всей строкой, а MAX может прислать
 * «/start параметр» или «/start@имя_бота» — тогда команда не распознавалась, а текст уходил в шаг анкеты как ответ.
 */
export function commandPattern(name: string): RegExp {
  return new RegExp(`^${name}(?:@\\S+)?(?:\\s.*)?$`, 'is');
}

/**
 * Отметка активности после события. Если это действие пользователя (сообщение или кнопка), он вернулся к анкете:
 * присланные напоминания удаляются, счётчик напоминаний сбрасывается. Служебные события напоминания не трогают.
 */
export function markActivity(ctx: BotContext, data: ProfileData, now = Date.now()): ProfileData {
  // Служебные события (mute, правка сообщения и т. п.) — не активность: таймер напоминаний не сбрасываем.
  if (!ACTIVITY.has(ctx.updateType)) return data;
  const returned = ctx.updateType !== 'bot_started';
  const stale = returned ? (data.reminderMessageIds ?? []) : [];
  if (stale.length > 0) cleanupInBackground(ctx, stale);
  return { ...data, lastActivityAt: now, remindersSent: [], reminderMessageIds: returned ? [] : data.reminderMessageIds };
}

/** Что считается активностью человека: сообщение, нажатие кнопки, «Начать». */
const ACTIVITY: ReadonlySet<string> = new Set(['message_created', 'message_callback', 'bot_started']);

/**
 * Запуск анкеты с приветствия — для «Начать» (bot_started), /start и любого сообщения без активной анкеты.
 * Незавершённая или уже завершённая анкета сбрасывается: иначе событие ушло бы в её текущий шаг,
 * и человек вместо приветствия увидел бы «выбери один из вариантов».
 */
export function startFresh(scenarios: ScenarioEngine<BotContext>): (ctx: BotContext) => Promise<void> {
  const start = scenarios.start(careerScenario);
  return async (ctx) => {
    ctx.scenario.cancel();
    await start(ctx, async () => undefined);
  };
}
