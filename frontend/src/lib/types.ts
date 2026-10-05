export type Language = 'en' | 'ar';
export type Theme = 'light' | 'dark';
export type Status = 'Active' | 'Paused' | 'Completed';
export type NoteKind = 'observation' | 'hypothesis' | 'decision';

export interface Person {
  id: string; // public id, MT-XXXXXXXX
  name: string;
  lab: string;
  initials: string;
  email?: string;
}

export interface AsrInfo {
  language: string | null;
  confidence: number;
  needs_review: boolean;
  language_rechecked: boolean;
  alternative: { engine: string; model: string; text: string } | null;
}

export interface Note {
  id: number;
  text: string;
  kind: NoteKind;
  source: 'manual' | 'recording';
  text_source: 'human' | 'asr';
  time_label: string | null;
  created_at: string;
  updated_at: string;
  author: Person | null;
  asr: AsrInfo | null;
  audio_file: string | null;
  has_audio: boolean;
  can_edit: boolean;
}

export interface Experiment {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: Status;
  duration: string;
  duration_sec: number;
  originality: number;
  tags: string[];
  color: string;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'editor';
  owner: Person;
  collaborators: Person[];
  note_count: number;
  session_id: string | null;
  ai_status: string;
  notes?: Note[];
  /** When each note happened and its kind (the last 40), for the trace drawn on cards. */
  trace?: TraceMark[];
  kind_counts?: Record<NoteKind, number>;
  /** The team it is shared with (everyone in it can see it and add notes), if any. */
  team?: { id: string; name: string } | null;
}

export interface TraceMark {
  at: string;
  kind: NoteKind;
  time_label: string | null;
}

export interface Stats {
  active_threads: number;
  total_threads: number;
  notes_this_week: number;
  notes_last_week: number;
  avg_originality: number;
  insights: {
    experiments_analyzed: number;
    notes_to_review: number;
    avg_documentation_quality: number | null;
    latest: { experiment_id: string; title: string; summary: string } | null;
  };
}

export interface InsightsResult {
  summary: string;
  ignored_note_ids?: number[];
  key_points?: string[];
  next_steps?: string[];
  documentation_quality: { score: number; strengths: string[]; gaps: string[] };
  novelty: { score: number; rationale: string; caveat: string };
  note_suggestions: { note_id: number; suggested_text: string; reason: string; confidence: string }[];
  notes_to_review: number[];
  note_kinds: { note_id: number; kind: NoteKind }[];
  literature?: Literature;
  meta?: { model: string; provider: string; generated_at: string; language?: string | null };
}

export interface SimilarPaper {
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  url: string;
  doi: string;
  source: string;
  similarity: 'high' | 'medium' | 'low';
  why: string;
}

export interface Literature {
  status: 'ok' | 'off' | 'skipped' | 'unavailable' | 'failed';
  score?: number;
  rationale?: string;
  caveat?: string;
  queries?: string[];
  sources?: string[];
  searched?: number;
  similar?: SimilarPaper[];
  error?: string;
}

export interface Insights {
  status: 'none' | 'disabled' | 'queued' | 'running' | 'done' | 'failed';
  result: InsightsResult | null;
  error: string | null;
  updated_at: string | null;
  ai_configured: boolean;
  needs_translation?: boolean;
}

export type NotificationKind = 'note_added' | 'note_updated' | 'collaborator_added' | 'status_changed' | 'team_added' | 'team_joined';

export interface NotificationItem {
  id: number | string;
  kind: NotificationKind;
  message: string;
  created_at: string;
  read: boolean;
  actor: Person | null;
  experiment: { id: string; title: string } | null;
  note_id?: number | null;
  local?: boolean; // created by a mock trigger in the browser only
}

export interface Health {
  ok: boolean;
  version: string;
  ai_configured: boolean;
  dev_tools: boolean;
}

export type TeamRole = 'owner' | 'supervisor' | 'member';

export interface Team {
  id: string;
  name: string;
  role: TeamRole;
  member_count: number;
  experiment_count: number;
  created_at: string;
}

export interface TeamMember extends Person {
  role: TeamRole;
  joined_at: string;
  experiment_count: number;
  notes_14d: number;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  experiments: Experiment[];
  /** Only for the owner and supervisors. */
  invite_token?: string;
}

export interface InvitePreview {
  team: { id: string; name: string; member_count: number };
  owner: Person;
  already_member: boolean;
}

export interface BridgeComputer {
  id: number;
  label: string;
  computer: string | null;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
  listener_running: boolean;
  device_connected: boolean;
  recording: boolean;
  firmware: string | null;
  levels: number[];
}

/** The link between the recording device and the platform (laptop app heartbeats). */
export interface BridgeStatus {
  linked: boolean;
  online: boolean;
  listener_running: boolean;
  device_connected: boolean;
  recording: boolean;
  levels: number[];
  firmware: string | null;
  last_upload_at: string | null;
  uploads: number;
  computers: BridgeComputer[];
}
