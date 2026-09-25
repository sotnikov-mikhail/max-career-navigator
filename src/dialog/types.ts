import type { Context, ScenarioController, ScenarioSession } from '@maxhub/max-bot-api';

export type Goal = 'internship' | 'job';

/** Ответы пользователя — то, что уходит в (демо) заявку. */
export interface ProfileAnswers {
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
  /** До двух вариантов. */
  motivation?: string[];
  /** Только для работы, если сработала корректировка завышенных ожиданий. */
  salaryRevision?: 'keep' | 'changed';
  verificationMethod?: string;
  /** Сами номера и фото не храним — только факт, что документ предоставлен (демо). */
  passportProvided?: boolean;
  idDocumentProvided?: boolean;
  verified?: boolean;
  contact?: string;
}

/** Служебное состояние диалога — в заявку не попадает. */
export interface DialogState {
  /** id сообщения с текущим вопросом — удаляется при «Изменить», сворачивается после ответа. */
  currentQuestionId?: string;
  /** id свёрнутого блока «вопрос: ответ» по каждому полю. */
  blockIds?: Partial<Record<keyof ProfileAnswers, string>>;
  /** Последний ответ, у которого сейчас висит кнопка «Изменить». */
  lastAnswered?: keyof ProfileAnswers;
  /** Выбор в мультивыборе мотивации до нажатия «Готово». */
  motivationDraft?: string[];
  cityFromGeo?: boolean;
  midpointSent?: boolean;
  /** id сообщений об ошибках ввода — удаляются, когда пользователь ответил правильно. */
  serviceMessageIds?: string[];
  lastActivityAt?: number;
  remindersSent?: string[];
  offersViewed?: boolean;
  completedAt?: number;
}

export type ProfileData = ProfileAnswers & DialogState;

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
  | 'await_midpoint'
  | 'await_work_format'
  | 'await_relocation'
  | 'await_overtime'
  | 'await_motivation'
  | 'await_salary_correction'
  | 'await_salary_fix'
  | 'await_verification'
  | 'await_passport'
  | 'await_inn'
  | 'await_contact'
  | 'await_final_action';

export interface BotSession extends ScenarioSession {}

export type BotContext = Context & {
  session?: BotSession;
  scenario: ScenarioController<BotContext>;
};
