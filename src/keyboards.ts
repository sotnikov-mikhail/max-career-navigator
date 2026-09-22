import { Keyboard } from '@maxhub/max-bot-api';
import type { ChoiceOption } from './dialog/script.js';

/** Одна опция — одна строка кнопок, как чек-лист в исходном сценарии. */
export function choiceKeyboard(options: ChoiceOption[]) {
  return Keyboard.inlineKeyboard(options.map((option) => [Keyboard.button.callback(option.label, option.id)]));
}

export function actionsKeyboard(actions: Array<{ label: string; payload: string }>) {
  return Keyboard.inlineKeyboard(actions.map((action) => [Keyboard.button.callback(action.label, action.payload)]));
}
