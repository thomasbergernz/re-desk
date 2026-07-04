import React, { useEffect, useState } from 'react';
import { invoke, router } from '@forge/bridge';
import RichText from './RichText';

const DESC_STORAGE_KEY = 'junbandesk.description.collapsed';

// localStorage can throw in a sandboxed iframe, so wrap access.
function loadDescCollapsed() {
  try {
    return window.localStorage.getItem(DESC_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveDescCollapsed(collapsed) {
  try {
    window.localStorage.setItem(DESC_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage unavailable — preference just won't survive a reload.
  }
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Inline ticket detail: fields, comment thread, reply box.
 *
 * Reply supports an internal-note toggle and a Zendesk-style
 * status-at-submit dropdown, so an agent can answer, mark the ticket
 * "waiting for customer" and move on without leaving the queue.
 */
const TicketDetail = ({ issueKey, remoteUpdated, onTicketChanged }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [transitionId, setTransitionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Assignable users load lazily the first time the dropdown is opened.
  const [assignees, setAssignees] = useState(null);
  const [assigning, setAssigning] = useState(false);
  // Collapsed state is a global preference, shared across tickets.
  const [descCollapsed, setDescCollapsed] = useState(loadDescCollapsed);

  const toggleDescription = () => {
    setDescCollapsed((prev) => {
      saveDescCollapsed(!prev);
      return !prev;
    });
  };

  // Guards against a stale response landing after the agent has already
  // switched rows: only the latest load() call may write state.
  const loadGeneration = React.useRef(0);

  // background: true re-fetches without tearing the pane down to a loading
  // screen — used after submit/assign so the thread stays visible while the
  // updated ticket loads.
  const load = async ({ background = false } = {}) => {
    const generation = ++loadGeneration.current;
    if (!background) setState({ status: 'loading' });
    try {
      const data = await invoke('getTicket', { issueKey });
      if (generation === loadGeneration.current) {
        setState({ status: 'ready', data });
      }
    } catch (err) {
      console.error('Failed to load ticket', err);
      if (generation === loadGeneration.current) {
        setState({ status: 'error', message: err.message });
      }
    }
  };

  // Reload whenever the agent picks a different row.
  useEffect(() => {
    setReply('');
    setInternal(false);
    setTransitionId('');
    setSubmitError(null);
    setAssignees(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKey]);

  // The queue poll noticed the ticket changed under us (another agent
  // replied or transitioned it) — its updated timestamp no longer matches
  // ours. Refresh in the background so the pane shows the real state.
  // Self-limiting: after the reload both timestamps match again, and a
  // ticket that left the queue (remoteUpdated undefined) reloads once.
  useEffect(() => {
    if (state.status !== 'ready') return;
    // Right after a row switch the pane still holds the previous ticket;
    // the issueKey effect is already loading, don't double-fetch.
    if (state.data.ticket.key !== issueKey) return;
    if (remoteUpdated === state.data.ticket.updated) return;
    load({ background: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteUpdated]);

  const loadAssignees = async () => {
    if (assignees) return; // already loaded for this ticket
    try {
      const users = await invoke('getAssignableUsers', { issueKey });
      setAssignees(users);
    } catch (err) {
      console.error('Failed to load assignable users', err);
      setAssignees([]);
      setSubmitError('Could not load assignable users');
    }
  };

  const assign = async (accountId) => {
    setAssigning(true);
    setSubmitError(null);
    try {
      await invoke('assignIssue', { issueKey, accountId });
      await load({ background: true });
      onTicketChanged();
    } catch (err) {
      console.error('Failed to assign', err);
      setSubmitError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reply.trim() && !transitionId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await invoke('submitReply', {
        issueKey,
        body: reply.trim(),
        internal,
        transitionId: transitionId || null,
      });
      // The comment can persist even when the status change fails. Clear
      // the reply box whenever the comment went through so a retry can't
      // post it twice, but surface the transition failure.
      if (result.commentPosted || result.ok) {
        setReply('');
      }
      setTransitionId('');
      if (!result.ok) {
        setSubmitError(result.transitionError || 'Status change failed');
      }
      await load({ background: true });
      onTicketChanged();
    } catch (err) {
      console.error('Failed to submit reply', err);
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="message loading">
        <span className="spinner" /> Loading {issueKey}…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="message error">
        Could not load {issueKey}: {state.message}
      </div>
    );
  }

  const { ticket, comments, transitions } = state.data;

  return (
    <div className="ticket-detail">
      <div className="ticket-header">
        <div className="ticket-title-row">
          <a
            href="#"
            className="issue-key"
            onClick={(e) => {
              e.preventDefault();
              router.open(`/browse/${issueKey}`);
            }}
          >
            {issueKey}
          </a>
          <h3 className="ticket-summary">{ticket.summary}</h3>
        </div>
        <div className="ticket-meta">
          <span className="lozenge">{ticket.status}</span>
          <span>Reporter: {ticket.reporter || '—'}</span>
          <span>Assignee: {ticket.assignee || 'Unassigned'}</span>
          <button
            className="assign-me-button"
            disabled={assigning}
            onClick={() => assign('me')}
          >
            {assigning ? (
              <>
                <span className="spinner spinner-small" /> Assigning…
              </>
            ) : (
              'Assign to me'
            )}
          </button>
          <select
            className="status-select"
            value=""
            disabled={assigning}
            onFocus={loadAssignees}
            onChange={(e) => {
              if (!e.target.value) return;
              assign(e.target.value === '__unassign__' ? null : e.target.value);
            }}
          >
            <option value="">Assign to…</option>
            <option value="__unassign__">(Unassign)</option>
            {(assignees || []).map((u) => (
              <option key={u.accountId} value={u.accountId}>
                {u.displayName}
              </option>
            ))}
          </select>
        </div>
        {ticket.description && (
          <div className="description-section">
            <button
              type="button"
              className="description-toggle"
              onClick={toggleDescription}
            >
              {descCollapsed ? '▸' : '▾'} Description
            </button>
            {!descCollapsed && (
              <div className="ticket-description">
                <RichText text={ticket.description} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="thread">
        {comments.length === 0 && (
          <div className="message">No comments yet.</div>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className={c.internal ? 'comment internal' : 'comment'}
          >
            <div className="comment-head">
              <strong>{c.author}</strong>
              {c.internal && <span className="internal-badge">Internal</span>}
              <span className="comment-date">{formatDateTime(c.created)}</span>
            </div>
            <div className="comment-body">
              <RichText text={c.body} />
            </div>
          </div>
        ))}
      </div>

      <form className="reply-box" onSubmit={handleSubmit}>
        <textarea
          className="reply-input"
          placeholder={
            internal ? 'Add an internal note…' : 'Reply to the customer…'
          }
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
        />
        <div className="reply-controls">
          <label className="internal-toggle">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal note
          </label>
          <select
            className="status-select"
            value={transitionId}
            onChange={(e) => setTransitionId(e.target.value)}
          >
            <option value="">Keep status: {ticket.status}</option>
            {transitions.map((t) => (
              <option key={t.id} value={t.id}>
                Move to: {t.to}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="submit-button"
            disabled={submitting || (!reply.trim() && !transitionId)}
          >
            {submitting ? (
              <>
                <span className="spinner spinner-light" /> Submitting…
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
        {submitError && (
          <div className="message error">Submit failed: {submitError}</div>
        )}
      </form>
    </div>
  );
};

export default TicketDetail;
