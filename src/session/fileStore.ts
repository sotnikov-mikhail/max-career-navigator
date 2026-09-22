import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
        const parsed = JSON.parse(raw) as Record<string, T>;
        for (const [key, value] of Object.entries(parsed)) {
          this.entries.set(key, value);
        }
      }
    }
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
    mkdirSync(dirname(this.filePath), { recursive: true });
    const plain = Object.fromEntries(this.entries);
    writeFileSync(this.filePath, JSON.stringify(plain, null, 2), 'utf-8');
  }
}
