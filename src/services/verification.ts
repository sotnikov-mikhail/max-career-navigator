/**
 * ДЕМО-верификация. Реальной интеграции с Госуслугами/ЕСИА нет — это осознанно
 * задекларированное ограничение MVP (см. README, раздел «Ограничения демо-режима»).
 */

export function isValidInnFormat(input: string): boolean {
  const digitsOnly = input.trim();
  return /^\d{10}$/.test(digitsOnly) || /^\d{12}$/.test(digitsOnly);
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
