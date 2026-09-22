import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import type { ProfileData } from '../dialog/types.js';

export interface Vacancy {
  id: string;
  title: string;
  org: string;
  city: string;
  field: string;
  goal: 'internship' | 'job';
  workFormat: string;
  pay: string;
}

interface VacancyDataset {
  synthetic: boolean;
  note: string;
  items: Vacancy[];
}

let cache: VacancyDataset | undefined;

function loadDataset(): VacancyDataset {
  if (!cache) {
    const raw = readFileSync(config.vacanciesFile, 'utf-8');
    cache = JSON.parse(raw) as VacancyDataset;
  }
  return cache;
}

/**
 * Подбирает демо-вакансии под профиль: сначала строгое совпадение по направлению и цели,
 * при нехватке результатов — ослабляет фильтр по цели, затем по городу.
 */
export function matchVacancies(profile: ProfileData, limit = 3): Vacancy[] {
  const { items } = loadDataset();
  const byField = items.filter((item) => !profile.field || profile.field === 'undecided' || item.field === profile.field || item.field === 'undecided');

  const scored = byField
    .map((item) => {
      let score = 0;
      if (profile.goal && item.goal === profile.goal) score += 2;
      if (profile.city && item.city.toLowerCase() === profile.city.trim().toLowerCase()) score += 2;
      if (profile.field && item.field === profile.field) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.item);
}

export function isSyntheticDataset(): boolean {
  return loadDataset().synthetic === true;
}
