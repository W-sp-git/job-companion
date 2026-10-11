export type SessionInfo = {
  id: string;
  mode: string;
  target_role: string;
  company?: string;
  jd_text?: string;
  max_rounds: number;
  status: string;
  created_at: string;
  total_score?: number | null;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type DimScore = { name: string; score: number };

export type Evaluation = {
  score: number;
  dimensions: DimScore[];
  comment: string;
  needs_follow_up: boolean;
  follow_up_hint: string;
};

export type QaReview = {
  round: number;
  question: string;
  answer_summary: string;
  score: number;
  better_answer: string;
};

export type InterviewReport = {
  overall_score: number;
  dimension_scores: DimScore[];
  strengths: string[];
  weaknesses: string[];
  per_question: QaReview[];
  improvement_plan: string[];
  recommended_practice: string[];
};

export type EducationItem = {
  school: string;
  major: string;
  degree: string;
  start: string;
  end: string;
  highlights: string[];
};

export type ExperienceItem = {
  org: string;
  role: string;
  start: string;
  end: string;
  bullets: string[];
};

export type ProjectItem = { name: string; role: string; bullets: string[] };

export type ResumeRaw = {
  name: string;
  phone: string;
  email: string;
  target_role: string;
  education: EducationItem[];
  skills: string[];
  internships: ExperienceItem[];
  projects: ProjectItem[];
  awards: string[];
  other: string[];
};

export type ResumeDraft = {
  name: string;
  phone: string;
  email: string;
  target_role: string;
  summary: string;
  education: EducationItem[];
  skills: string[];
  internships: ExperienceItem[];
  projects: ProjectItem[];
  awards: string[];
  target_gaps: string[];
};

export type ReviewIssue = {
  severity: string;
  location: string;
  problem: string;
  suggestion: string;
};

export type FactualityViolation = { type: string; value: string; reason: string };

export type ReviewReport = {
  overall: string;
  issues: ReviewIssue[];
  factuality_notes?: string[];
  ats_matched?: string[];
  ats_missing?: string[];
  factuality_violations?: FactualityViolation[];
};

export type MemoryItem = {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type ResumeVersion = {
  id: number;
  resume_id: number;
  version_no: number;
  draft_json: ResumeDraft;
  review_json: ReviewReport | null;
  docx_path: string | null;
  created_at: string;
};

export type CreatePayload = {
  mode: string;
  target_role: string;
  jd_text?: string;
  company?: string;
  max_rounds: number;
};

export const MODE_LABELS: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术面试",
  project: "项目深挖",
  pressure: "压力面试",
};
