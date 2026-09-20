// Row → view-shape translators. Each accepts either a snake_case Supabase row,
// a joined row (e.g. { student: profiles }), or an already view-shaped mock
// object. Missing / nullable columns degrade gracefully — never throw.

function safe(row) {
  return row && typeof row === 'object' ? row : {};
}

function pick(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function joinedStudent(row) {
  const r = safe(row);
  const nested = safe(r.student ?? r.profiles ?? r.profile ?? r.students);
  return { root: r, nested };
}

function studentNameFrom(row) {
  const { root, nested } = joinedStudent(row);
  return (
    pick(root, 'studentName', 'student_name', 'name', 'fullName') ??
    pick(nested, 'fullName', 'full_name', 'name', 'studentName', 'student_name') ??
    ''
  );
}

function elevateMeIdFrom(row) {
  const { root, nested } = joinedStudent(row);
  return (
    pick(root, 'elevateMeId', 'elevate_me_id', 'elevateId', 'elevate_id') ??
    pick(nested, 'elevateMeId', 'elevate_me_id', 'elevateId', 'elevate_id') ??
    ''
  );
}

export function toProgram(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id', 'slug') ?? null,
    slug: pick(r, 'slug', 'id') ?? null,
    date: pick(r, 'date', 'display_date') ?? '',
    title: pick(r, 'title', 'name') ?? '',
    category: pick(r, 'category', 'program_category') ?? '',
    singleEventType: pick(r, 'singleEventType', 'single_event_type', 'event_type') ?? null,
    typeLabel: pick(r, 'typeLabel', 'type_label', 'program_type') ?? '',
    institute: pick(r, 'institute', 'institute_name', 'organizer') ?? '',
    venue: pick(r, 'venue', 'location') ?? '',
    startDate: pick(r, 'startDate', 'start_date', 'starts_at') ?? null,
    endDate: pick(r, 'endDate', 'end_date', 'ends_at') ?? null,
    capacity: pick(r, 'capacity', 'max_capacity') ?? 0,
    registered: pick(r, 'registered', 'registered_count', 'enrolled') ?? 0,
    status: pick(r, 'status', 'state') ?? '',
    description: pick(r, 'description', 'details', 'summary') ?? '',
    meta: pick(r, 'meta', 'subtitle', 'tagline') ?? '',
  };
}

export function toSession(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    programId: pick(r, 'programId', 'program_id', 'program') ?? null,
    title: pick(r, 'title', 'name') ?? '',
    topic: pick(r, 'topic', 'subject', 'theme') ?? '',
    date: pick(r, 'date', 'session_date', 'starts_at') ?? null,
    venue: pick(r, 'venue', 'location') ?? '',
  };
}

export function toRegistration(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    studentName: studentNameFrom(r),
    elevateMeId: elevateMeIdFrom(r),
    programId: pick(r, 'programId', 'program_id', 'program') ?? null,
    allocation: pick(r, 'allocation', 'committee_allocation', 'slot') ?? '',
    status: pick(r, 'status', 'registration_status', 'state') ?? '',
    evaluationState:
      pick(r, 'evaluationState', 'evaluation_state', 'evaluation', 'evaluationStatus', 'evaluation_status') ?? '',
    when: pick(r, 'when', 'slot_label', 'scheduled_at', 'created_at', 'date') ?? '',
  };
}

function normalizeScores(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((s) => {
      if (s === null || s === undefined) return { criterion: '', score: null };
      if (typeof s === 'object') {
        return {
          criterion: pick(s, 'criterion', 'criterion_key', 'criterionKey', 'label', 'key', 'name') ?? '',
          score: pick(s, 'score', 'value', 'points', 'grade') ?? null,
        };
      }
      return { criterion: '', score: s };
    });
  }
  if (typeof input === 'object') {
    return Object.entries(input).map(([criterion, score]) => ({ criterion, score: score ?? null }));
  }
  return [];
}

export function toEvaluation(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    studentName: studentNameFrom(r),
    elevateMeId: elevateMeIdFrom(r),
    session: pick(r, 'session', 'session_label', 'session_title', 'sessionTitle') ?? '',
    programId: pick(r, 'programId', 'program_id', 'program') ?? null,
    state: pick(r, 'state', 'status', 'evaluation_state') ?? '',
    released: Boolean(pick(r, 'released', 'is_released', 'published') ?? false),
    scores: normalizeScores(pick(r, 'scores', 'score_items', 'criteria', 'levels')),
    remarks: pick(r, 'remarks', 'comment', 'feedback', 'notes') ?? '',
  };
}

export function toRecommendation(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    date: pick(r, 'date', 'created_at', 'updated_at') ?? '',
    title: pick(r, 'title', 'heading') ?? '',
    body: pick(r, 'body', 'description', 'content', 'text') ?? '',
    skill: pick(r, 'skill', 'skill_area', 'criterion') ?? '',
    related: pick(r, 'related', 'related_label', 'context') ?? '',
    priority: pick(r, 'priority') ?? '',
    status: pick(r, 'status', 'state') ?? '',
    studentName: studentNameFrom(r),
  };
}

export function toAnnouncement(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    date: pick(r, 'date', 'created_at', 'published_at') ?? '',
    sender: pick(r, 'sender', 'author', 'from', 'sender_name') ?? '',
    title: pick(r, 'title', 'heading', 'subject') ?? '',
    body: pick(r, 'body', 'content', 'text', 'message') ?? '',
    audience: pick(r, 'audience', 'target', 'audience_label') ?? '',
    isNew: Boolean(pick(r, 'isNew', 'is_new', 'unread', 'is_unread') ?? false),
  };
}

export function toThread(row) {
  const r = safe(row);
  return {
    id: pick(r, 'id') ?? null,
    date: pick(r, 'date', 'created_at', 'updated_at') ?? '',
    from: pick(r, 'from', 'sender', 'author', 'sender_name', 'from_name') ?? '',
    subject: pick(r, 'subject', 'title', 'heading') ?? '',
    preview: pick(r, 'preview', 'excerpt', 'snippet', 'body', 'content') ?? '',
    state: pick(r, 'state', 'status') ?? '',
    updatedAt: pick(r, 'updatedAt', 'updated_at', 'last_reply_at', 'date') ?? null,
  };
}

export function toReply(row) {
  const r = safe(row);
  return {
    author: pick(r, 'author', 'sender', 'from', 'author_name') ?? '',
    when: pick(r, 'when', 'created_at', 'sent_at', 'date') ?? '',
    body: pick(r, 'body', 'content', 'text', 'message') ?? '',
  };
}

export function toProfile(row) {
  const r = safe(row);
  const role = pick(r, 'role', 'activeRole', 'active_role') ?? 'student';
  const availableRoles =
    pick(r, 'availableRoles', 'available_roles', 'roles') ?? (role ? [role] : []);
  return {
    userId: pick(r, 'userId', 'user_id', 'id', 'auth_id') ?? null,
    name: pick(r, 'name', 'fullName', 'full_name', 'display_name') ?? '',
    email: pick(r, 'email', 'email_address') ?? '',
    role,
    availableRoles: Array.isArray(availableRoles) ? availableRoles : [availableRoles].filter(Boolean),
    status: pick(r, 'status', 'state', 'approval_status') ?? '',
    elevateMeId: elevateMeIdFrom(r) || null,
  };
}
