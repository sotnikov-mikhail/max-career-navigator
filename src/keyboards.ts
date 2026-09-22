import { Keyboard } from '@maxhub/max-bot-api';
import type { ChoiceOption } from './dialog/script.js';

/** Одна опция — одна строка кнопок, как чек-лист в исходном сценарии. */
export function choiceKeyboard(options: ChoiceOption[]) {
  return Keyboard.inlineKeyboard(options.map((option) => [Keyboard.button.callback(option.label, option.id)]));
}

/** Короткие бинарные варианты — в один ряд, кнопки растянутся на всю ширину поровну. */
export function choiceKeyboardRow(options: ChoiceOption[]) {
  return Keyboard.inlineKeyboard([options.map((option) => Keyboard.button.callback(option.label, option.id))]);
}

export function actionsKeyboard(actions: Array<{ label: string; payload: string }>) {
  return Keyboard.inlineKeyboard(actions.map((action) => [Keyboard.button.callback(action.label, action.payload)]));
}

/** Кнопка отправки геопозиции + быстрые города по два в ряд (payload `city:<id>` — латиница, без кириллицы). */
export function cityKeyboard(cities: Array<{ id: string; name: string }>) {
  const rows: ReturnType<typeof Keyboard.button.callback | typeof Keyboard.button.requestGeoLocation>[][] = [
    [Keyboard.button.requestGeoLocation('📍 Отправить геопозицию')],
  ];
  for (let i = 0; i < cities.length; i += 2) {
    rows.push(cities.slice(i, i + 2).map((city) => Keyboard.button.callback(city.name, `city:${city.id}`)));
  }
  return Keyboard.inlineKeyboard(rows);
}
