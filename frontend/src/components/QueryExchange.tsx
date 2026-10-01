import { useState } from 'react';
import styles from './QueryExchange.module.css';
import { FollowUpList } from './FollowUpList';

export interface QueryMsg { id: string; from: 'you' | 'di'; body: string; when: string }

interface ExchangeProps {
  queryBody: string;
  queryWhen?: string;
  replyBody?: string | null;
  replyWhen?: string;
  comments?: Array<{ id: string; body: string; when: string }>;
  initiatedByDi?: boolean;
  // Legacy shape (kept for compatibility; prefer the flat props above).
  initial?: QueryMsg[];
  followUps?: QueryMsg[];
}

// QueryExchange: row1 two cells Your query | DI reply (In review if none),
// below full-width Further comments (latest 2 + Expand all).
// DI-initiated variant headers: Your response / DI message. No chat bubbles.
export function QueryExchange(props: ExchangeProps) {
  const [expanded, setExpanded] = useState(false);

  let queryBody = props.queryBody ?? '';
  let queryWhen = props.queryWhen ?? '';
  let replyBody: string | null = props.replyBody ?? null;
  let replyWhen = props.replyWhen ?? '';
  let comments = props.comments ?? [];
  const initiatedByDi = props.initiatedByDi ?? false;

  if (props.initial && props.initial.length > 0 && !props.queryBody) {
    const you = props.initial.find((m) => m.from === 'you');
    const di = props.initial.find((m) => m.from === 'di');
    queryBody = you?.body ?? '';
    queryWhen = you?.when ?? '';
    replyBody = di?.body ?? null;
    replyWhen = di?.when ?? '';
  }
  if (props.followUps && props.followUps.length > 0 && comments.length === 0) {
    comments = props.followUps.map((m) => ({ id: m.id, body: m.body, when: m.when }));
  }

  const leftLabel = initiatedByDi ? 'Your response' : 'Your query';
  const rightLabel = initiatedByDi ? 'DI message' : 'DI reply';
  const visible = expanded ? comments : comments.slice(-2);
  const followupsId = 'query-followups-list';

  return (
    <div className={styles.exchange} data-testid="query-exchange">
      <div className={styles.row}>
        <article className={styles.cell} aria-labelledby="qe-left-h">
          <header><h3 id="qe-left-h"><strong>{leftLabel}</strong></h3>{queryWhen && <span>{queryWhen}</span>}</header>
          <p>{queryBody}</p>
        </article>
        <article className={styles.cell} aria-labelledby="qe-right-h">
          <header><h3 id="qe-right-h"><strong>{rightLabel}</strong></h3>{replyWhen && <span>{replyWhen}</span>}</header>
          {replyBody ? <p>{replyBody}</p> : <p role="status">In review</p>}
        </article>
      </div>
      <section className={styles.followups} aria-labelledby="qe-followups-h">
        <h3 id="qe-followups-h">Further comments</h3>
        {comments.length === 0 ? (
          <p className={styles.meta}>No further comments.</p>
        ) : (
          <>
            <div id={followupsId}>
              <FollowUpList items={visible} />
            </div>
            {comments.length > 2 && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={followupsId}
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Show less' : `Expand all (${comments.length})`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
