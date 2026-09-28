import { Bot, ScenarioEngine, session } from '@maxhub/max-bot-api';
import { config } from './config.js';
import { careerScenario } from './dialog/flow.js';
import { RESTART_HINT } from './dialog/script.js';
import type { BotContext, BotSession, ProfileData } from './dialog/types.js';
import { startReminders } from './reminders.js';
import { FileSessionStore } from './session/fileStore.js';
import { deleteSubmissionsForChat } from './services/profileRegistryMock.js';

const bot = new Bot<BotContext>(config.botToken);
const scenarios = new ScenarioEngine<BotContext>();
scenarios.register(careerScenario);
const store = new FileSessionStore<BotSession>(config.sessionsFile);

/** Сеть до MAX может быть недоступна в момент старта — не падаем, а повторяем попытку. */
async function getMyInfoWithRetry(): Promise<Awaited<ReturnType<typeof bot.api.getMyInfo>>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await bot.api.getMyInfo();
    } catch (error) {
      const delay = Math.min(60, 5 * attempt);
      console.error(`Не удалось подключиться к MAX (попытка ${attempt}), повтор через ${delay} с`, (error as Error).message);
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    }
  }
}

const info = await getMyInfoWithRetry();
console.log(`Бот @${info.username} авторизован, запускаю long polling...`);

// Меню команд — некритично: при сбое сети бот всё равно запускается.
await bot.api.setMyCommands([
  { name: 'start', description: 'Начать заново' },
  { name: 'cancel', description: 'Отменить текущий шаг' },
  { name: 'delete_data', description: 'Отозвать согласие и удалить мои данные' },
]).catch((error) => console.error('Не удалось обновить меню команд (не критично)', (error as Error).message));

bot.use(session<BotSession, BotContext>({ store }));

/**
 * 1) Сессии со старой версии сценария (шаг, которого больше нет) сбрасываем, чтобы человек не застрял.
 * 2) После каждого события отмечаем активность — от неё считаются напоминания через 30 минут и 2 часа.
 */
bot.use(async (ctx, next) => {
  const before = ctx.session?.scenario;
  if (before && !(before.step in careerScenario.steps)) delete ctx.session!.scenario;
  await next();
  const after = ctx.session?.scenario;
  if (after) {
    after.data = { ...(after.data as ProfileData), lastActivityAt: Date.now(), remindersSent: [] };
  }
});

bot.use(scenarios.controllerMiddleware());

// Отзыв согласия на обработку персональных данных (152-ФЗ): удаляем сессию и заявки этого чата.
bot.command('delete_data', async (ctx) => {
  ctx.scenario.cancel();
  ctx.session = undefined;
  if (ctx.chatId != null) deleteSubmissionsForChat(ctx.chatId);
  await ctx.reply('🗑 Согласие отозвано, твои данные удалены. Чтобы начать заново, напиши /start.');
});

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

// Кнопка из старого сообщения, когда сценария уже нет (сброшен /cancel или устарел) — не молчим.
bot.on('message_callback', async (ctx) => {
  await ctx.answerOnCallback({ notification: 'Эта кнопка больше не активна' } as Parameters<BotContext['answerOnCallback']>[0]);
  await ctx.reply(`Эта анкета уже неактивна. ${RESTART_HINT}`);
});

bot.catch(async (err, ctx) => {
  console.error('Ошибка при обработке события', ctx.updateType, err);
  try {
    await ctx.reply('Что-то пошло не так. Попробуй ещё раз или напиши /start, чтобы начать заново.');
  } catch (replyError) {
    console.error('Не удалось отправить сообщение об ошибке пользователю', replyError);
  }
});

startReminders(bot, store);

await bot.start();
