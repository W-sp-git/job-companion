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

export type StatsTrendPoint = {
  session_id: string;
  date: string;
  mode: string;
  target_role: string;
  company: string;
  score: number;
  dimensions: Record<string, number>;
  questions: number;
};

export type InterviewStats = {
  overview: {
    session_count: number;
    question_count: number;
    avg_score: number;
    best_score: number;
  };
  dimension_names: string[];
  trend: StatsTrendPoint[];
};

export type WeaknessTheme = { theme: string; count: number; last_seen: string };

export type WeaknessClusters = { clustered: boolean; themes: WeaknessTheme[] };

export type IntelSource = { sid: number; lane: string; title: string; url: string; date?: string };

export type ClaimStatus = "verified" | "unverified";

export type IntelClaim = { text: string; status: ClaimStatus; sources: IntelSource[] };

export type IntelHiring = {
  position: string;
  location: string;
  trend: string;
  status: ClaimStatus;
  sources: IntelSource[];
};

export type IntelSalary = {
  role_hint: string;
  range_text: string;
  notes: string;
  status: ClaimStatus;
  sources: IntelSource[];
};

export type IntelProcessStage = {
  stage: string;
  detail: string;
  status: ClaimStatus;
  sources: IntelSource[];
};

export type IntelRisk = { category: string; text: string; sources: IntelSource[] };

export type IntelReport = {
  company: string;
  target_role: string;
  summary: string;
  summary_sources: IntelSource[];
  basics: IntelClaim[];
  hiring: IntelHiring[];
  salary: IntelSalary[];
  process: IntelProcessStage[];
  risks: IntelRisk[];
};

export type IntelVerification = {
  total_claims: number;
  verified: number;
  unverified: number;
  dropped_risk: number;
  coverage: number;
  evidence_total: number;
  notes: string[];
};

export type IntelReportPayload = {
  report_id: number;
  company: string;
  target_role: string;
  created_at: string;
  report: IntelReport;
  verification: IntelVerification;
  sources: IntelSource[];
};

export type IntelReportMeta = {
  id: number;
  company: string;
  target_role: string;
  status: "created" | "running" | "done" | "failed";
  source_count: number;
  summary: string;
  error: string;
  created_at: string;
  finished_at: string | null;
};

export const MODE_LABELS: Record<string, string> = {
  behavioral: "行为面试",
  technical: "技术面试",
  project: "项目深挖",
  pressure: "压力面试",
};
