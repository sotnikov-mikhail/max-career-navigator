import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomic } from '../session/fileStore.js';
import { config } from '../config.js';
import type { ProfileAnswers } from '../dialog/types.js';

/**
 * ЭМУЛЯЦИЯ передачи профиля во внешний реестр (в перспективе — «Работа России» / центры занятости).
 * Никакого реального обращения к внешним государственным системам не происходит —
 * запись просто добавляется в локальный JSON-файл. Паспортные данные, ИНН и СНИЛС сюда
 * не попадают — только флаги, что документ предоставлен.
 */
export interface SubmissionRecord {
  submittedAt: string;
  chatId: number;
  demo: true;
  profile: ProfileAnswers;
}

function readSubmissions(): SubmissionRecord[] {
  if (!existsSync(config.submissionsFile)) return [];
  const raw = readFileSync(config.submissionsFile, 'utf-8');
  if (!raw.trim()) return [];
  try {
    return JSON.parse(raw) as SubmissionRecord[];
  } catch (error) {
    console.error('Файл заявок повреждён — начинаю новый список', error);
    return [];
  }
}

/** Отзыв согласия: удаляет все заявки этого чата. Возвращает, сколько записей удалено. */
export function deleteSubmissionsForChat(chatId: number): number {
  const submissions = readSubmissions();
  const kept = submissions.filter((r) => r.chatId !== chatId);
  if (kept.length !== submissions.length) writeFileAtomic(config.submissionsFile, JSON.stringify(kept, null, 2));
  return submissions.length - kept.length;
}

export function submitProfileMock(chatId: number, profile: ProfileAnswers): SubmissionRecord {
  const record: SubmissionRecord = {
    submittedAt: new Date().toISOString(),
    chatId,
    demo: true,
    profile,
  };
  // Один профиль на чат: повторная отправка (после «Изменить») заменяет прежнюю запись, а не добавляет вторую.
  const submissions = readSubmissions().filter((r) => r.chatId !== chatId);
  submissions.push(record);
  mkdirSync(dirname(config.submissionsFile), { recursive: true });
  writeFileAtomic(config.submissionsFile, JSON.stringify(submissions, null, 2));
  return record;
}
