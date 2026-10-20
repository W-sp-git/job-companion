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
  context?: {
    job_id?: number;
    resume_version_id?: number;
    feedback_mode?: string;
    locale?: string;
  };
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
  other?: string[];
};

export type ReviewIssue = {
  severity: string;
  location: string;
  problem: string;
  suggestion: string;
};

export type FactualityViolation = {
  type: string;
  value: string;
  reason: string;
};

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
  context?: {
    job_id?: number;
    company?: string;
    target_role?: string;
    jd_text?: string;
    label?: string;
    review_acknowledged?: boolean;
  };
  export_issues?: FactualityViolation[];
};

export type CreatePayload = {
  mode: string;
  target_role: string;
  jd_text?: string;
  company?: string;
  max_rounds: number;
  job_id?: number;
  resume_version_id?: number;
  intel_report_id?: number;
  locale?: "zh" | "en";
  feedback_mode?: "coaching" | "simulation";
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

export type IntelSource = {
  sid: number;
  lane: string;
  title: string;
  url: string;
  date?: string;
};

export type ClaimStatus = "verified" | "unverified";

export type IntelClaim = {
  text: string;
  status: ClaimStatus;
  sources: IntelSource[];
  evidence_quote?: string;
};

export type IntelHiring = {
  position: string;
  location: string;
  trend: string;
  status: ClaimStatus;
  sources: IntelSource[];
  evidence_quote?: string;
};

export type IntelSalary = {
  role_hint: string;
  range_text: string;
  notes: string;
  status: ClaimStatus;
  sources: IntelSource[];
  evidence_quote?: string;
};

export type IntelProcessStage = {
  stage: string;
  detail: string;
  status: ClaimStatus;
  sources: IntelSource[];
  evidence_quote?: string;
};

export type IntelRisk = {
  category: string;
  text: string;
  sources: IntelSource[];
  evidence_quote?: string;
};

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

export type JobStatus =
  | "saved"
  | "preparing"
  | "applied"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";
export type JobAnalysis = {
  summary: string;
  requirements: {
    requirement: string;
    category: string;
    status: "supported" | "gap" | "unknown";
    evidence_id: string;
    evidence_quote: string;
    evidence_quotes?: string[];
    evidence_label: string;
    explanation: string;
    next_action: string;
  }[];
  preparation: string[];
  questions_to_ask: string[];
  analyzed_at?: string;
};
export type Job = {
  id: number;
  company: string;
  target_role: string;
  city: string;
  batch: string;
  jd_text: string;
  source_url: string;
  deadline: string;
  status: JobStatus;
  next_action: string;
  action_date: string;
  notes: string;
  resume_version_id: number | null;
  intel_report_id: number | null;
  analysis_json: Partial<JobAnalysis>;
  analysis_stale?: boolean;
  activities?: JobActivity[];
  sessions?: SessionInfo[];
  updated_at: string;
};
export type JobActivity = {
  id: number;
  kind: string;
  content: string;
  details_json: Record<string, string>;
  created_at: string;
};
export type ExperienceFact = {
  id: number;
  title: string;
  kind: "project" | "internship" | "education" | "activity";
  organization: string;
  role: string;
  situation: string;
  action: string;
  result: string;
  skills: string[];
  source: string;
  confirmed: boolean;
  updated_at: string;
};
export type PracticeAttempt = {
  id: number;
  answer: string;
  score: number;
  created_at: string;
  evaluation_json: {
    criteria: {
      criterion_index: number;
      criterion: string;
      score: number;
      evidence_quote: string;
      feedback: string;
    }[];
    next_step: string;
    reference_outline: string;
  };
};
export type PracticeTask = {
  id: number;
  job_id: number | null;
  session_id: string;
  skill: string;
  question: string;
  rubric_json: string[];
  source_text: string;
  status: string;
  due_date: string;
  attempts: PracticeAttempt[];
};
export type ResumeFile = {
  id: number;
  filename: string;
  raw_json: ResumeRaw;
  created_at: string;
  versions?: ResumeVersion[];
};
