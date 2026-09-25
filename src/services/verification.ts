/**
 * ДЕМО-верификация. Реальной интеграции с Госуслугами/ЕСИА нет — это осознанно
 * задекларированное ограничение MVP (см. README, раздел «Ограничения демо-режима»).
 */

export function isValidInnFormat(input: string): boolean {
  const digitsOnly = input.trim();
  return /^\d{10}$/.test(digitsOnly) || /^\d{12}$/.test(digitsOnly);
}

/**
 * Паспорт вручную: каких обязательных данных не хватает в сообщении. Проверяем то, что можно узнать
 * по формату: серию и номер, код подразделения, две даты (выдачи и рождения); «кем выдан», место
 * рождения и адрес — по объёму текста. Пустой список — всё на месте.
 */
export function missingPassportFields(input: string): string[] {
  const missing: string[] = [];
  if (!/(^|\D)\d{2}\s?\d{2}\s?\d{6}(\D|$)/.test(input)) missing.push('серия и номер');
  if (!/(^|\D)\d{3}-\d{3}(\D|$)/.test(input)) missing.push('код подразделения');
  const dates = input.match(/\d{2}\.\d{2}\.\d{4}/g) ?? [];
  if (dates.length < 2) missing.push('дата выдачи и дата рождения');
  const words = input.replace(/[\d.:-]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 8) missing.push('кем выдан, место рождения и адрес регистрации');
  return missing;
}

/** СНИЛС: 11 цифр, допускаются пробелы и дефисы (формат 123-456-789 01). */
export function isValidSnilsFormat(input: string): boolean {
  return /^\d{11}$/.test(input.replace(/[\s-]/g, ''));
}

export function isValidIdFormat(input: string): boolean {
  return isValidInnFormat(input) || isValidSnilsFormat(input);
}

export interface DemoVerificationResult {
  verified: true;
  verifiedAt: number;
  demo: true;
}

/** Имитирует обращение к внешнему ID-провайдеру с небольшой задержкой. */
export async function runDemoVerification(): Promise<DemoVerificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { verified: true, verifiedAt: Date.now(), demo: true };
}
