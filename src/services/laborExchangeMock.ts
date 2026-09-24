import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { ProfileAnswers } from '../dialog/types.js';

/**
 * ДЕМО-имитация передачи анкеты «на биржу труда и в федеральную базу».
 * Никакого реального обращения к внешним государственным системам не происходит —
 * запись просто добавляется в локальный JSON-файл для демонстрации сценария.
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
  return JSON.parse(raw) as SubmissionRecord[];
}

export function submitToLaborExchangeMock(chatId: number, profile: ProfileAnswers): SubmissionRecord {
  const record: SubmissionRecord = {
    submittedAt: new Date().toISOString(),
    chatId,
    demo: true,
    profile,
  };
  const submissions = readSubmissions();
  submissions.push(record);
  mkdirSync(dirname(config.submissionsFile), { recursive: true });
  writeFileSync(config.submissionsFile, JSON.stringify(submissions, null, 2), 'utf-8');
  return record;
}
