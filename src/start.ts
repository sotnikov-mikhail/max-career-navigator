import type { ScenarioEngine } from '@maxhub/max-bot-api';
import { careerScenario } from './dialog/flow.js';
import type { BotContext } from './dialog/types.js';

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
