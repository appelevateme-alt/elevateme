import type {
  Announcement,
  Institute,
  MessageThread,
  Program,
  Recommendation,
  Registration,
  Session,
  User,
} from "./types";

// Pilot seed: one MUN event + one continuous speaking program (plan §17).

export const mockUsers: User[] = [
  { id: "u-student", fullName: "Amaya Perera", email: "amaya@example.edu", roles: ["student"], activeRole: "student", status: "Approved" },
  { id: "u-parent", fullName: "Nimal Perera", email: "nimal@example.com", roles: ["parent"], activeRole: "parent", status: "Approved" },
  { id: "u-coord", fullName: "Sarah Fernando", email: "sarah@college.edu", roles: ["coordinator", "evaluator"], activeRole: "coordinator", status: "Approved" },
  { id: "u-eval", fullName: "David Mensah", email: "david@diplomaticimpact.org", roles: ["evaluator"], activeRole: "evaluator", status: "Approved" },
  { id: "u-admin", fullName: "Diplomatic Impact Admin", email: "admin@diplomaticimpact.org", roles: ["admin"], activeRole: "admin", status: "Approved" },
];

export const mockInstitutes: Institute[] = [
  { id: "ins-1", name: "Colombo International College", verified: true },
  { id: "ins-2", name: "Kandy Youth Forum", verified: false },
];

export const mockPrograms: Program[] = [
  {
    id: "p-mun",
    title: "Model United Nations — Colombo 2026",
    category: "SingleEvent",
    singleEventType: "ModelUN",
    institute: "Colombo International College",
    venue: "Main Hall, Colombo",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    capacity: 120,
    registered: 87,
    status: "Published",
    description: "Two-day MUN with committees, country allocation, and one evaluation round.",
  },
  {
    id: "p-speaking",
    title: "Academic Speaking — Continuous Cohort A",
    category: "ContinuousProgramme",
    institute: "Kandy Youth Forum",
    venue: "Weekly — Room 4 + online",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    capacity: 40,
    registered: 32,
    status: "InProgress",
    description: "Weekly speaking sessions with longitudinal evaluation across 6+ sessions.",
  },
  {
    id: "p-debate",
    title: "Friendly Debate — Motion Night",
    category: "SingleEvent",
    singleEventType: "FriendlyDebate",
    institute: "Colombo International College",
    venue: "Auditorium",
    startDate: "2026-10-24",
    endDate: "2026-10-24",
    capacity: 60,
    registered: 12,
    status: "UnderReview",
    description: "Draft submitted by coordinator, awaiting admin review.",
  },
];

export const mockSessions: Session[] = [
  { id: "s-mun-1", programId: "p-mun", title: "UNHRC — Committee A", topic: "Freedom of expression and assembly", date: "2026-10-10", venue: "Main Hall" },
  { id: "s-mun-2", programId: "p-mun", title: "DISEC — Committee B", topic: "Small arms regulation", date: "2026-10-11", venue: "Room 2" },
  { id: "s-spk-1", programId: "p-speaking", title: "Session 3 — Persuasive structure", topic: "Claim, evidence, impact", date: "2026-09-19", venue: "Room 4" },
];

export const mockRegistrations: Registration[] = [
  { id: "r-1", studentName: "Amaya Perera", elevateMeId: "EM-00100", programId: "p-mun", allocation: "UNHRC — France", status: "Confirmed", evaluationState: "Submitted" },
  { id: "r-2", studentName: "Liam Silva", elevateMeId: "EM-00101", programId: "p-mun", allocation: "UNHRC — Brazil", status: "Pending", evaluationState: "NotStarted" },
  { id: "r-3", studentName: "Amaya Perera", elevateMeId: "EM-00100", programId: "p-speaking", allocation: "Cohort A", status: "Attended", evaluationState: "Locked" },
];

export const mockAnnouncements: Announcement[] = [
  { id: "a-1", title: "MUN briefing pack published", body: "Committee allocations and briefing notes are available under Programs.", date: "2026-09-12", sender: "Diplomatic Impact", audience: "All students" },
  { id: "a-2", title: "Speaking cohort — room change", body: "Session 3 moves to Room 4. Online link unchanged.", date: "2026-09-15", sender: "Sarah Fernando", audience: "Cohort A" },
];

export const mockRecommendations: Recommendation[] = [
  { id: "rec-1", title: "Work on counter-arguments", action: "Prepare one 60-second rebuttal drill before Session 4.", reason: "Counter Arguments scored G across last two sessions.", skill: "Counter Arguments", priority: "High", status: "New", studentName: "Amaya Perera" },
  { id: "rec-2", title: "Projection exercise", action: "Practice projection drill (3 × 2 min) and re-record.", reason: "Sound dipped from VG to G in Session 3.", skill: "Sound", priority: "Medium", status: "Viewed", studentName: "Amaya Perera" },
];

export const mockThreads: MessageThread[] = [
  { id: "m-1", subject: "MUN preparation query", studentName: "Amaya Perera", state: "Replied", updatedAt: "2026-09-14", preview: "Reply from Diplomatic Impact received." },
  { id: "m-2", subject: "Session absence — Oct 24", studentName: "Amaya Perera", state: "Open", updatedAt: "2026-09-16", preview: "Awaiting reply." },
];

export interface MockEvaluation {
  id: string;
  studentName: string;
  elevateMeId: string;
  session: string;
  programId: string;
  state: string;
  released: boolean;
  scores: { criterion: string; level: string }[];
  remarks: string;
}

export const mockEvaluations: MockEvaluation[] = [
  {
    id: "e-1",
    studentName: "Amaya Perera",
    elevateMeId: "EM-00100",
    session: "Session 3 — Persuasive structure",
    programId: "p-speaking",
    state: "Locked",
    released: true,
    scores: [
      { criterion: "Preparation", level: "VG" },
      { criterion: "Clarity", level: "G" },
      { criterion: "Confidence", level: "VG" },
      { criterion: "Sound", level: "G" },
      { criterion: "Counter Arguments", level: "G" },
      { criterion: "Overall Performance", level: "VG" },
    ],
    remarks: "Strong structure; work rebuttal timing. 50+ computed total shown after scale finalization.",
  },
  {
    id: "e-2",
    studentName: "Amaya Perera",
    elevateMeId: "EM-00100",
    session: "UNHRC — Committee A",
    programId: "p-mun",
    state: "Submitted",
    released: false,
    scores: [],
    remarks: "",
  },
];

export interface MockThreadDetail {
  id: string;
  subject: string;
  studentName: string;
  state: "Open" | "Replied" | "Closed";
  updatedAt: string;
  body: string;
  replies: { author: string; date: string; body: string }[];
}

export const mockThreadDetails: MockThreadDetail[] = [
  {
    id: "m-1",
    subject: "MUN preparation query",
    studentName: "Amaya Perera",
    state: "Replied",
    updatedAt: "2026-09-14",
    body: "Hello — which committee briefing should I prepare first for UNHRC? I am allocated France.",
    replies: [
      { author: "Diplomatic Impact", date: "2026-09-14", body: "Prepare the freedom-of-expression brief first; DISEC material follows next week." },
    ],
  },
  {
    id: "m-2",
    subject: "Session absence — Oct 24",
    studentName: "Amaya Perera",
    state: "Open",
    updatedAt: "2026-09-16",
    body: "I may miss Motion Night on Oct 24 due to exams. Can I attend the online track instead?",
    replies: [],
  },
];

export function publishedPrograms(): Program[] {
  return mockPrograms.filter((p) => p.status === "Published" || p.status === "InProgress");
}
