import React from 'react';

const CATEGORY_CLASS = {
  new: 'lozenge lozenge-new',
  indeterminate: 'lozenge lozenge-progress',
  done: 'lozenge lozenge-done',
};

// Compact relative age, e.g. "3d" or "2h". Stale tickets stand out
// without needing a full timestamp column.
function age(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const QueueTable = ({ issues, selectedKey, onSelect }) => {
  if (!issues.length) {
    return <div className="message">Queue is clear. Nothing needs action.</div>;
  }

  return (
    <table className="queue-table">
      <thead>
        <tr>
          <th>Key</th>
          <th className="col-summary">Summary</th>
          <th>Reporter</th>
          <th>Status</th>
          <th>Assignee</th>
          <th className="col-age">Updated</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <tr
            key={issue.key}
            className={issue.key === selectedKey ? 'row selected' : 'row'}
            onClick={() => onSelect(issue.key)}
          >
            <td className="cell-key">{issue.key}</td>
            <td className="cell-summary" title={issue.summary}>
              {issue.summary}
            </td>
            <td>{issue.reporter || '—'}</td>
            <td>
              <span className={CATEGORY_CLASS[issue.statusCategory] || 'lozenge'}>
                {issue.status}
              </span>
            </td>
            <td>{issue.assignee || <em className="unassigned">Unassigned</em>}</td>
            <td className="col-age">{age(issue.updated)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default QueueTable;
