import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';
import QueueTable from './QueueTable';
import TicketDetail from './TicketDetail';

// How often the queue table refreshes itself in the background.
const POLL_INTERVAL_MS = 30_000;

const FILTER_STORAGE_KEY = 'junbandesk.queue.filter';

// localStorage can throw in a sandboxed iframe, so wrap access.
function loadSavedFilter() {
  try {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    return ['all', 'unassigned', 'mine'].includes(saved) ? saved : 'all';
  } catch (err) {
    console.warn('localStorage unavailable, filter will not persist', err);
    return 'all';
  }
}

function saveFilter(filter) {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, filter);
  } catch {
    // Storage unavailable — filter just won't survive a reload.
  }
}

const SELECTED_STORAGE_KEY = 'junbandesk.queue.selected';

function loadSavedSelection() {
  try {
    return window.localStorage.getItem(SELECTED_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function saveSelection(key) {
  try {
    if (key) {
      window.localStorage.setItem(SELECTED_STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(SELECTED_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable — selection just won't survive a reload.
  }
}

const SPLIT_STORAGE_KEY = 'junbandesk.queue.split';

// Queue pane width as a % of the workspace. Clamped so neither pane can
// be dragged into uselessness.
const SPLIT_DEFAULT = 55;
const SPLIT_MIN = 25;
const SPLIT_MAX = 75;

function clampSplit(pct) {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
}

function loadSavedSplit() {
  try {
    const saved = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampSplit(saved) : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
}

function saveSplit(pct) {
  try {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
  } catch {
    // Storage unavailable — split just won't survive a reload.
  }
}

/**
 * Junban Desk queue workspace.
 *
 * Layout: "needs action" ticket table on the left, inline detail pane
 * (comment thread + reply box) on the right. Replaces the default JSM
 * queue views with only what agents need.
 */
const App = () => {
  const [queue, setQueue] = useState({ status: 'loading' });
  // Restored from the last session so a forced page reload lands the agent
  // back on the ticket they were working; validated against the first queue
  // load below.
  const [selectedKey, setSelectedKeyState] = useState(loadSavedSelection);

  const setSelectedKey = useCallback((key) => {
    setSelectedKeyState(key);
    saveSelection(key);
  }, []);
  // True while a refresh of an already-loaded table is in flight, so the
  // table can show a progress bar instead of being torn down.
  const [refreshing, setRefreshing] = useState(false);
  // 'all' | 'unassigned' | 'mine' — applied client-side to the loaded queue.
  const [filter, setFilterState] = useState(loadSavedFilter);

  const setFilter = useCallback((f) => {
    setFilterState(f);
    saveFilter(f);
  }, []);

  const loadQueue = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await invoke('getQueue');
      setQueue({ status: 'ready', data });
    } catch (err) {
      console.error('Failed to load queue', err);
      // Keep showing the last good table on a failed background
      // refresh; only surface the error if we have nothing to show.
      setQueue((prev) =>
        prev.status === 'ready' ? prev : { status: 'error', message: err.message }
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Background poll so new tickets appear without a manual refresh.
  // Skips ticks while the tab is hidden to save invocations, and
  // refreshes immediately when the agent returns to the tab.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) loadQueue();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadQueue]);

  // Called by the detail pane after a reply/transition so the table
  // reflects the new state (e.g. ticket left the needs-action list).
  const handleTicketChanged = useCallback(() => {
    loadQueue();
  }, [loadQueue]);

  // Draggable divider between the two panes. Pointer capture keeps the
  // drag alive even when the cursor briefly leaves the 6px handle.
  const [splitPct, setSplitPct] = useState(loadSavedSplit);
  const [dragging, setDragging] = useState(false);
  const workspaceRef = useRef(null);

  const onDividerPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onDividerPointerMove = useCallback((e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setSplitPct(clampSplit(((e.clientX - rect.left) / rect.width) * 100));
  }, []);

  const onDividerPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    setSplitPct((pct) => {
      saveSplit(pct);
      return pct;
    });
  }, []);

  const onDividerDoubleClick = useCallback(() => {
    setSplitPct(SPLIT_DEFAULT);
    saveSplit(SPLIT_DEFAULT);
  }, []);

  // Drop a restored selection whose ticket is no longer in the queue
  // (resolved or waiting since last session). Runs once on the first
  // successful load — later refreshes must not close the pane, e.g. right
  // after the agent transitions the ticket away.
  const restoreValidated = useRef(false);
  useEffect(() => {
    if (queue.status !== 'ready' || restoreValidated.current) return;
    restoreValidated.current = true;
    if (
      selectedKey &&
      !queue.data.issues.some((i) => i.key === selectedKey)
    ) {
      setSelectedKey(null);
    }
  }, [queue, selectedKey, setSelectedKey]);

  if (queue.status === 'loading') {
    return (
      <div className="message loading">
        <span className="spinner" /> Loading queue…
      </div>
    );
  }
  if (queue.status === 'error') {
    return (
      <div className="message error">Could not load queue: {queue.message}</div>
    );
  }

  const { issues, project, currentUser } = queue.data;

  const matchesFilter = (i, f) => {
    if (f === 'unassigned') return !i.assigneeId;
    if (f === 'mine') return i.assigneeId === currentUser.accountId;
    return true;
  };

  const filtered = issues.filter((i) => matchesFilter(i, filter));

  // Switching filters closes the detail pane if the open ticket isn't in the
  // new view — avoids showing a ticket the filter says you're not looking at.
  // Only fires on an explicit filter change, not on background refreshes.
  const changeFilter = (f) => {
    setFilter(f);
    const selected = issues.find((i) => i.key === selectedKey);
    if (selectedKey && (!selected || !matchesFilter(selected, f))) {
      setSelectedKey(null);
    }
  };

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'mine', label: 'Assigned to me' },
  ].map((f) => ({
    ...f,
    count: issues.filter((i) => matchesFilter(i, f.id)).length,
  }));

  return (
    <div
      className={dragging ? 'workspace dragging' : 'workspace'}
      ref={workspaceRef}
    >
      <div className="queue-pane" style={{ flex: `0 0 ${splitPct}%` }}>
        <div className="queue-toolbar">
          <h2 className="queue-title">Needs action</h2>
          <span className="queue-count">in {project.key}</span>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={filter === f.id ? 'filter-button active' : 'filter-button'}
              onClick={() => changeFilter(f.id)}
            >
              {f.label} ({f.count})
            </button>
          ))}
          <button
            className="refresh-button"
            onClick={loadQueue}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {/* Fixed-height track so the bar appearing doesn't shift the table. */}
        <div className="progress-track">
          {refreshing && <div className="progress-fill" />}
        </div>
        <div className={refreshing ? 'table-wrap refreshing' : 'table-wrap'}>
          <QueueTable
            issues={filtered}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>
      </div>
      <div
        className="divider"
        title="Drag to resize; double-click to reset"
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={onDividerPointerUp}
        onDoubleClick={onDividerDoubleClick}
      />
      <div className="detail-pane">
        {selectedKey ? (
          <TicketDetail
            issueKey={selectedKey}
            // The queue's last-seen updated timestamp for this ticket
            // (undefined once it left the needs-action list). The detail
            // pane compares it against its own data and refreshes itself
            // when another user changed the ticket, so it can't go stale
            // and cause double handling.
            remoteUpdated={
              issues.find((i) => i.key === selectedKey)?.updated
            }
            onTicketChanged={handleTicketChanged}
          />
        ) : (
          <div className="message">Select a ticket to view its thread.</div>
        )}
      </div>
    </div>
  );
};

export default App;
