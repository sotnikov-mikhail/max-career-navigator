import type { Context, ScenarioController, ScenarioSession } from '@maxhub/max-bot-api';

export type Goal = 'internship' | 'job';

export interface ProfileData {
  name?: string;
  studyStage?: string;
  goal?: Goal;
  city?: string;
  field?: string;
  /** Стажировка: exp_yes / exp_no; работа: exp_0_1 / exp_2_3 / exp_4_5 / exp_5p. */
  experience?: string;
  employment?: string;
  /** Стажировка: intern_paid / intern_unpaid; работа: вилка sal_*. */
  salary?: string;
  workFormat?: string;
  relocation?: string;
  overtime?: string;
  motivation?: string;
  /** Спрашивается только для работы, если ожидания по зарплате выше типичных для такого опыта. */
  salaryRevision?: string;
  verified?: boolean;
  verifiedAt?: number;
  /** Служебное: id сообщения с вопросом о городе — чтобы свернуть его после ответа текстом/геопозицией. */
  cityPromptId?: string;
  /** Служебное: id сообщений об ошибках ввода — удаляются, когда пользователь ответил правильно. */
  serviceMessageIds?: string[];
}

export type Step =
  | 'greet'
  | 'await_name'
  | 'await_study_stage'
  | 'await_goal'
  | 'await_city'
  | 'await_field'
  | 'await_experience'
  | 'await_employment'
  | 'await_salary'
  | 'await_work_format'
  | 'await_relocation'
  | 'await_overtime'
  | 'await_motivation'
  | 'await_salary_revision'
  | 'await_final_action'
  | 'await_inn';

export interface BotSession extends ScenarioSession {}

export type BotContext = Context & {
  session?: BotSession;
  scenario: ScenarioController<BotContext>;
};
