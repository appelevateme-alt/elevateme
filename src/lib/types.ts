// ElevateMe domain types — frontend-only mocks aligned to plan §7.
// Backend (Prisma/Postgres) will implement these later; keep names stable.

export type Role =
  | "student"
  | "parent"
  | "coordinator"
  | "evaluator"
  | "admin";

export type AccountStatus =
  | "Draft"
  | "EmailUnverified"
  | "PendingReview"
  | "Approved"
  | "ChangesRequested"
  | "Rejected"
  | "Suspended";

export type ProgramCategory =
  | "SingleEvent"
  | "ContinuousProgramme"
  | "SpecialProgramme";

export type SingleEventType =
  | "ModelUN"
  | "FriendlyDebate"
  | "Competition"
  | "Special";

export type ProgramStatus =
  | "Draft"
  | "Submitted"
  | "UnderReview"
  | "ChangesRequested"
  | "Approved"
  | "Rejected"
  | "Published"
  | "RegistrationClosed"
  | "InProgress"
  | "Completed"
  | "Archived";

export type RegistrationStatus =
  | "Pending"
  | "Confirmed"
  | "Waitlisted"
  | "Withdrawn"
  | "Attended"
  | "Absent"
  | "Completed";

export type EvaluationState =
  | "NotStarted"
  | "Draft"
  | "Submitted"
  | "Locked"
  | "Reopened";

export type MessageState = "Open" | "Replied" | "Closed";

export interface User {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
  activeRole: Role;
  status: AccountStatus;
}

export interface StudentProfile {
  userId: string;
  elevateMeId: string; // display ID, e.g. EM-00100
  institute: string;
  dateOfBirth?: string;
}

export interface Institute {
  id: string;
  name: string;
  verified: boolean;
}

export interface Program {
  id: string;
  title: string;
  category: ProgramCategory;
  singleEventType?: SingleEventType;
  institute: string;
  venue: string;
  startDate: string;
  endDate: string;
  capacity: number;
  registered: number;
  status: ProgramStatus;
  description: string;
}

export interface Session {
  id: string;
  programId: string;
  title: string;
  topic: string;
  date: string;
  venue: string;
}

export interface Registration {
  id: string;
  studentName: string;
  elevateMeId: string;
  programId: string;
  allocation: string;
  status: RegistrationStatus;
  evaluationState: EvaluationState;
}

export type ScoreLevel = "L" | "G" | "VG" | "E";
// Numeric add-on mapping deferred by product (plan §5.6 / §16 Q3).
// Frontend stores the level; totals shown as `50+` computed display only.

export interface Criterion {
  key: string;
  label: string;
  help: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  sender: string;
  audience: string;
}

export interface Recommendation {
  id: string;
  title: string;
  action: string;
  reason: string;
  skill: string;
  priority: "Low" | "Medium" | "High";
  status: "New" | "Viewed" | "Completed";
  studentName: string;
}

export interface MessageThread {
  id: string;
  subject: string;
  studentName: string;
  state: MessageState;
  updatedAt: string;
  preview: string;
}

export const TEN_CRITERIA: Criterion[] = [
  { key: "preparation", label: "Preparation", help: "Evidence of research and readiness." },
  { key: "clarity", label: "Clarity", help: "Ideas expressed in a clear, ordered way." },
  { key: "confidence", label: "Confidence", help: "Composure and self-assurance when speaking." },
  { key: "focus", label: "Focus", help: "Stays on motion, topic, and time." },
  { key: "critical-analysis", label: "Critical Analysis", help: "Depth of reasoning and use of evidence." },
  { key: "sound", label: "Sound", help: "Vocal quality and audibility: volume, pace, projection." },
  { key: "audience", label: "Audience Addressing", help: "Engages and addresses the audience or committee." },
  { key: "counter", label: "Counter Arguments", help: "Responds to opposing points directly." },
  { key: "wit", label: "Wit", help: "Timely, appropriate sharpness — never at others' expense." },
  { key: "overall", label: "Overall Performance", help: "Holistic impression for this session." },
];
