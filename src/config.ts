import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Скопируйте .env.example в .env и заполните её.`);
  }
  return value;
}

export const config = {
  botToken: requireEnv('BOT_TOKEN'),
  sessionsFile: process.env.SESSIONS_FILE ?? 'data/sessions.json',
  submissionsFile: process.env.SUBMISSIONS_FILE ?? 'data/submissions.json',
  vacanciesFile: process.env.VACANCIES_FILE ?? 'data/vacancies.json',
};
