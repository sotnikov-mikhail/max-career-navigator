import { Keyboard } from '@maxhub/max-bot-api';
import type { ChoiceOption } from './dialog/script.js';

type AnyButton = ReturnType<typeof Keyboard.button.callback | typeof Keyboard.button.requestGeoLocation>;

/** Одна опция — одна строка кнопок, как чек-лист в сценарии. */
export function choiceKeyboard(options: ChoiceOption[]) {
  return Keyboard.inlineKeyboard(options.map((option) => [Keyboard.button.callback(option.label, option.id)]));
}

/** Короткие бинарные варианты — в один ряд, кнопки растянутся на всю ширину поровну. */
export function choiceKeyboardRow(options: ChoiceOption[]) {
  return Keyboard.inlineKeyboard([options.map((option) => Keyboard.button.callback(option.label, option.id))]);
}

/** Два варианта — в ряд, больше — столбиком. */
export function autoKeyboard(options: ChoiceOption[]) {
  return options.length === 2 ? choiceKeyboardRow(options) : choiceKeyboard(options);
}

export function actionsKeyboard(actions: Array<{ label: string; payload: string }>) {
  return Keyboard.inlineKeyboard(actions.map((action) => [Keyboard.button.callback(action.label, action.payload)]));
}

/** Кнопка геопозиции + быстрые города по два в ряд (payload `city:<id>` — латиница, без кириллицы). */
export function cityKeyboard(cities: Array<{ id: string; name: string }>) {
  const rows: AnyButton[][] = [[Keyboard.button.requestGeoLocation('📍 Определить по геопозиции')]];
  for (let i = 0; i < cities.length; i += 2) {
    rows.push(cities.slice(i, i + 2).map((city) => Keyboard.button.callback(city.name, `city:${city.id}`)));
  }
  return Keyboard.inlineKeyboard(rows);
}

/** Мультивыбор: выбранные варианты отмечены ✔️ слева. Payload варианта — `multi:<id>`. */
export function multiKeyboard(options: ChoiceOption[], selected: string[]) {
  return Keyboard.inlineKeyboard(
    options.map((option) => [
      Keyboard.button.callback(selected.includes(option.id) ? `✔️ ${option.label}` : option.label, `multi:${option.id}`),
    ]),
  );
}
