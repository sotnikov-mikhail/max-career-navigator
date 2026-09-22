import { Bot, ScenarioEngine, session } from '@maxhub/max-bot-api';
import { config } from './config.js';
import { careerScenario } from './dialog/flow.js';
import { RESTART_HINT } from './dialog/script.js';
import type { BotContext, BotSession } from './dialog/types.js';
import { FileSessionStore } from './session/fileStore.js';

const bot = new Bot<BotContext>(config.botToken);
const scenarios = new ScenarioEngine<BotContext>();
scenarios.register(careerScenario);

const info = await bot.api.getMyInfo();
console.log(`Бот @${info.username} авторизован, запускаю long polling...`);

await bot.api.setMyCommands([
  { name: 'start', description: 'Начать заново' },
  { name: 'cancel', description: 'Отменить текущий шаг' },
]);

bot.use(session<BotSession, BotContext>({ store: new FileSessionStore<BotSession>(config.sessionsFile) }));
bot.use(scenarios.controllerMiddleware());

bot.command('cancel', async (ctx) => {
  const canceled = ctx.scenario.cancel();
  await ctx.reply(canceled ? 'Ок, отменил текущий шаг. Напиши /start, чтобы начать заново.' : 'Сейчас нет активного сценария.');
});

bot.command('start', async (ctx, next) => {
  ctx.scenario.cancel();
  return next();
}, scenarios.start(careerScenario));

bot.use(scenarios.interceptMiddleware());

bot.on('bot_started', scenarios.start(careerScenario));

bot.on('message_created', async (ctx) => {
  await ctx.reply(`Не совсем понял. ${RESTART_HINT}`);
});

bot.catch((err, ctx) => {
  console.error('Ошибка при обработке события', ctx.updateType, err);
});

await bot.start();
