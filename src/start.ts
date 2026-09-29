import type { ScenarioEngine } from '@maxhub/max-bot-api';
import { careerScenario } from './dialog/flow.js';
import type { BotContext } from './dialog/types.js';

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
