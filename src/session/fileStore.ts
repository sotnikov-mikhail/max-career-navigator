import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SyncSessionStore } from '@maxhub/max-bot-api';

/**
 * Простое файловое хранилище сессий: переживает рестарт процесса/контейнера
 * без внешней БД. Весь файл читается один раз при старте и держится в памяти,
 * каждое изменение сразу сбрасывается на диск (нагрузка хакатон-бота это допускает).
 */
export class FileSessionStore<T> implements SyncSessionStore<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly filePath: string) {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      if (raw.trim()) {
        try {
          const parsed = JSON.parse(raw) as Record<string, T>;
          for (const [key, value] of Object.entries(parsed)) {
            this.entries.set(key, value);
          }
        } catch (error) {
          // Повреждённый файл не должен ронять бота при старте: анкеты начнутся заново.
          console.error('Файл сессий повреждён — начинаю с пустого хранилища', error);
        }
      }
    }
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    this.entries.set(key, value);
    this.persist();
  }

  delete(key: string): void {
    this.entries.delete(key);
    this.persist();
  }

  private persist(): void {
    writeFileAtomic(this.filePath, JSON.stringify(Object.fromEntries(this.entries), null, 2));
  }
}

/** Запись через временный файл и rename: при падении посреди записи старый файл остаётся целым. */
export function writeFileAtomic(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}
