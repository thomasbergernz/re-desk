import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

/**
 * Extracts plain text from an Atlassian Document Format (ADF) body.
 * Comments come back as ADF JSON; the queue UI renders plain text with
 * preserved paragraph breaks, which is enough for a support thread.
 */
function adfToText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  // Smart links (pasted URLs Jira upgraded to cards) carry their URL in
  // attrs and have no text content — without this they vanish entirely.
  if (['inlineCard', 'blockCard', 'embedCard'].includes(node.type)) {
    return node.attrs?.url || '';
  }
  const children = (node.content || []).map(adfToText).join('');
  // Block-level nodes get a trailing newline so paragraphs stay separated.
  if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)) {
    return `${children}\n`;
  }
  return children;
}

/**
 * Wraps plain text in a minimal ADF document for the comment API.
 * Each line becomes its own paragraph.
 */
function textToAdf(text) {
  const paragraphs = text.split('\n').map((line) => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  return { type: 'doc', version: 1, content: paragraphs };
}

/** Shapes a Jira search result issue down to what the queue table renders. */
function toQueueIssue(i) {
  return {
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    statusCategory: i.fields.status?.statusCategory?.key,
    reporter: i.fields.reporter?.displayName,
    assignee: i.fields.assignee?.displayName,
    assigneeId: i.fields.assignee?.accountId,
    created: i.fields.created,
    updated: i.fields.updated,
  };
}

/**
 * Returns the "needs action" queue for the current JSM project:
 * every open ticket that is not waiting on the customer.
 *
 * Runs asUser so agents only see tickets they can browse.
 */
resolver.define('getQueue', async (req) => {
  // The queue page context carries the project it renders in.
  const projectKey = req.context?.extension?.project?.key;
  if (!projectKey) {
    throw new Error('getQueue must be invoked from a JSM queue page');
  }
  // Defence in depth: the key is interpolated into JQL below, so reject
  // anything that isn't a plain Jira project key before it gets there.
  if (!/^[A-Z][A-Z0-9_]*$/.test(projectKey)) {
    throw new Error(`Unexpected project key format: ${projectKey}`);
  }

  const fields = 'summary,status,reporter,assignee,created,updated';

  // Preferred definition: open AND not waiting on the customer. The
  // status clause fails with a 400 if the project has no "Waiting for
  // customer" status, so fall back to plain "open" in that case.
  const preferred = `project = "${projectKey}" AND statusCategory != Done AND status != "Waiting for customer" ORDER BY updated ASC`;
  const fallback = `project = "${projectKey}" AND statusCategory != Done ORDER BY updated ASC`;

  let res = await api
    .asUser()
    .requestJira(route`/rest/api/3/search/jql?jql=${preferred}&fields=${fields}&maxResults=100`);
  if (res.status === 400) {
    res = await api
      .asUser()
      .requestJira(route`/rest/api/3/search/jql?jql=${fallback}&fields=${fields}&maxResults=100`);
  }
  if (!res.ok) {
    throw new Error(`Queue search failed: ${res.status}`);
  }
  const search = await res.json();

  return {
    project: { key: projectKey },
    // The frontend uses this for its "Mine" filter and "Assign to me".
    currentUser: { accountId: req.context.accountId },
    issues: (search.issues || []).map(toQueueIssue),
  };
});

/**
 * Lists users who can be assigned to the given issue. Loaded lazily by
 * the detail pane's assignee dropdown.
 */
resolver.define('getAssignableUsers', async (req) => {
  const { issueKey } = req.payload;
  if (!issueKey) {
    throw new Error('getAssignableUsers requires an issueKey');
  }

  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/user/assignable/search?issueKey=${issueKey}&maxResults=50`);
  if (!res.ok) {
    throw new Error(`Assignable user search failed: ${res.status}`);
  }
  const users = await res.json();

  return users.map((u) => ({
    accountId: u.accountId,
    displayName: u.displayName,
  }));
});

/**
 * Assigns an issue. accountId 'me' resolves to the invoking agent,
 * null unassigns. Runs asUser so Jira enforces assign permission.
 */
resolver.define('assignIssue', async (req) => {
  const { issueKey, accountId } = req.payload;
  if (!issueKey) {
    throw new Error('assignIssue requires an issueKey');
  }

  const targetId = accountId === 'me' ? req.context.accountId : accountId;

  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issueKey}/assignee`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: targetId || null }),
    });
  if (res.status !== 204) {
    throw new Error(`Assign failed: ${res.status}`);
  }
  return { ok: true };
});

/**
 * Returns one ticket for the detail pane: fields, full comment thread
 * (internal notes marked), and the transitions available to the agent.
 */
resolver.define('getTicket', async (req) => {
  const { issueKey } = req.payload;
  if (!issueKey) {
    throw new Error('getTicket requires an issueKey');
  }

  const [issueRes, commentsRes, transitionsRes] = await Promise.all([
    api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,reporter,assignee,updated`),
    api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}/comment?orderBy=created&maxResults=100`),
    api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`),
  ]);

  if (!issueRes.ok) {
    throw new Error(`Failed to load ${issueKey}: ${issueRes.status}`);
  }
  const issue = await issueRes.json();
  // Partial failures degrade to empty lists but must not be silent —
  // an empty thread caused by a 5xx looks identical to "no comments".
  if (!commentsRes.ok) {
    console.warn(`getTicket: comments load failed for ${issueKey}: ${commentsRes.status}`);
  }
  if (!transitionsRes.ok) {
    console.warn(`getTicket: transitions load failed for ${issueKey}: ${transitionsRes.status}`);
  }
  const comments = commentsRes.ok ? await commentsRes.json() : { comments: [] };
  const transitions = transitionsRes.ok
    ? await transitionsRes.json()
    : { transitions: [] };

  return {
    ticket: {
      key: issue.key,
      summary: issue.fields.summary,
      // Description arrives as ADF; the pane renders plain text.
      description: adfToText(issue.fields.description).trim(),
      status: issue.fields.status?.name,
      reporter: issue.fields.reporter?.displayName,
      assignee: issue.fields.assignee?.displayName,
      // Compared against the queue's view of the ticket so the detail
      // pane can spot edits made by someone else and refresh itself.
      updated: issue.fields.updated,
    },
    comments: (comments.comments || []).map((c) => ({
      id: c.id,
      author: c.author?.displayName,
      created: c.created,
      // JSM marks customer-visible comments jsdPublic=true; anything
      // explicitly false is an internal agent note.
      internal: c.jsdPublic === false,
      body: adfToText(c.body).trim(),
    })),
    transitions: (transitions.transitions || []).map((t) => ({
      id: t.id,
      name: t.name,
      to: t.to?.name,
    })),
  };
});

/**
 * Submits a reply and/or status change from the detail pane.
 * - body + internal=false → customer-visible reply
 * - body + internal=true  → internal note (sd.public.comment property)
 * - transitionId          → optional status-at-submit, applied after the comment
 *
 * Runs asUser so the comment is attributed to the agent.
 */
resolver.define('submitReply', async (req) => {
  const { issueKey, body, internal, transitionId } = req.payload;
  if (!issueKey) {
    throw new Error('submitReply requires an issueKey');
  }

  if (body) {
    const payload = {
      body: textToAdf(body),
      // Comments created via the Jira API on JSM issues are public by
      // default; this property flags internal agent notes.
      ...(internal && {
        properties: [{ key: 'sd.public.comment', value: { internal: true } }],
      }),
    };
    const commentRes = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    if (!commentRes.ok) {
      // Nothing persisted yet — safe to fail the whole call and let the
      // agent retry without risking a duplicate comment.
      throw new Error(`Comment failed: ${commentRes.status}`);
    }
  }

  if (transitionId) {
    const transitionRes = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
    if (transitionRes.status !== 204) {
      // The comment (if any) already persisted. Throwing here would make
      // the frontend keep the reply text and a retry would post it twice,
      // so report the partial failure instead of failing the call.
      return {
        ok: false,
        commentPosted: Boolean(body),
        transitionError: `Status change failed: ${transitionRes.status}`,
      };
    }
  }

  return { ok: true, commentPosted: Boolean(body) };
});

export const handler = resolver.getDefinitions();
