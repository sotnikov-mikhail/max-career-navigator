import type { Context, ScenarioController, ScenarioSession } from '@maxhub/max-bot-api';

export type Goal = 'internship' | 'job';

export interface ProfileData {
  name?: string;
  studyStage?: string;
  goal?: Goal;
  city?: string;
  field?: string;
  interest?: string;
  employment?: string;
  employmentFormal?: string;
  salary?: string;
  workFormat?: string;
  overtime?: string;
  motivation?: string;
  verified?: boolean;
  verifiedAt?: number;
}

export type Step =
  | 'greet'
  | 'await_name'
  | 'await_study_stage'
  | 'await_goal'
  | 'await_city'
  | 'await_field'
  | 'await_interest'
  | 'await_employment'
  | 'await_employment_formal'
  | 'await_salary'
  | 'await_work_format'
  | 'await_overtime'
  | 'await_motivation'
  | 'await_final_action'
  | 'await_inn';

export interface BotSession extends ScenarioSession {}

export type BotContext = Context & {
  session?: BotSession;
  scenario: ScenarioController<BotContext>;
};
