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

export function submitProfileMock(chatId: number, profile: ProfileAnswers): SubmissionRecord {
  const record: SubmissionRecord = {
    submittedAt: new Date().toISOString(),
    chatId,
    demo: true,
    profile,
  };
  const submissions = readSubmissions();
  submissions.push(record);
  mkdirSync(dirname(config.submissionsFile), { recursive: true });
  writeFileAtomic(config.submissionsFile, JSON.stringify(submissions, null, 2));
  return record;
}
