/**
 * ДЕМО-верификация. Реальной интеграции с Госуслугами/ЕСИА нет — это осознанно
 * задекларированное ограничение MVP (см. README, раздел «Ограничения демо-режима»).
 */

export function isValidInnFormat(input: string): boolean {
  const digitsOnly = input.trim();
  return /^\d{10}$/.test(digitsOnly) || /^\d{12}$/.test(digitsOnly);
}

/** Паспорт РФ: серия (4 цифры) + номер (6 цифр), пробелы допускаются. */
export function isValidPassportFormat(input: string): boolean {
  return /^\d{10}$/.test(input.replace(/\s/g, ''));
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
