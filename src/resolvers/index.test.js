import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Forge SDK. The Resolver mock collects definitions so tests can
// call resolver functions directly through the exported handler map.
vi.mock('@forge/resolver', () => ({
  default: class Resolver {
    constructor() {
      this.definitions = {};
    }

    define(name, fn) {
      this.definitions[name] = fn;
    }

    getDefinitions() {
      return this.definitions;
    }
  },
}));

const requestJira = vi.fn();

vi.mock('@forge/api', () => ({
  default: {
    asUser: () => ({ requestJira }),
    asApp: () => ({ requestJira }),
  },
  // Reproduce route's shape: a tagged template that joins parts. The real
  // implementation also encodes params; tests only need the final string.
  route: (strings, ...values) =>
    strings.raw.reduce((acc, s, i) => acc + s + (values[i] ?? ''), ''),
}));

const { handler } = await import('./index.js');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  requestJira.mockReset();
});

describe('getQueue', () => {
  const context = { accountId: 'agent-1', extension: { project: { key: 'FS' } } };

  it('throws without a project in context', async () => {
    await expect(handler.getQueue({ context: {} })).rejects.toThrow(
      'must be invoked from a JSM queue page'
    );
  });

  it('rejects project keys that could break out of the JQL string', async () => {
    const bad = { accountId: 'a', extension: { project: { key: 'FS" OR reporter=x' } } };
    await expect(handler.getQueue({ context: bad })).rejects.toThrow(
      'Unexpected project key format'
    );
    expect(requestJira).not.toHaveBeenCalled();
  });

  it('maps search results and returns the current user', async () => {
    requestJira.mockResolvedValueOnce(
      jsonResponse({
        issues: [
          {
            key: 'FS-1',
            fields: {
              summary: 'Help',
              status: { name: 'Open', statusCategory: { key: 'new' } },
              reporter: { displayName: 'Rita' },
              assignee: { displayName: 'Ann', accountId: 'ann-1' },
              created: '2026-01-01T00:00:00.000Z',
              updated: '2026-01-02T00:00:00.000Z',
            },
          },
        ],
      })
    );

    const result = await handler.getQueue({ context });

    expect(result.currentUser).toEqual({ accountId: 'agent-1' });
    expect(result.project).toEqual({ key: 'FS' });
    expect(result.issues).toEqual([
      {
        key: 'FS-1',
        summary: 'Help',
        status: 'Open',
        statusCategory: 'new',
        reporter: 'Rita',
        assignee: 'Ann',
        assigneeId: 'ann-1',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z',
      },
    ]);
    // Preferred JQL excludes tickets waiting on the customer.
    expect(requestJira.mock.calls[0][0]).toContain('Waiting for customer');
  });

  it('falls back to plain open-ticket JQL when the status clause 400s', async () => {
    requestJira
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 400 }))
      .mockResolvedValueOnce(jsonResponse({ issues: [] }));

    const result = await handler.getQueue({ context });

    expect(result.issues).toEqual([]);
    expect(requestJira).toHaveBeenCalledTimes(2);
    expect(requestJira.mock.calls[1][0]).not.toContain('Waiting for customer');
  });

  it('throws when the search fails outright', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
    await expect(handler.getQueue({ context })).rejects.toThrow('Queue search failed: 500');
  });
});

describe('getTicket', () => {
  it('requires an issueKey', async () => {
    await expect(handler.getTicket({ payload: {} })).rejects.toThrow(
      'requires an issueKey'
    );
  });

  it('maps fields, flags internal comments, extracts comment text from ADF', async () => {
    requestJira
      .mockResolvedValueOnce(
        jsonResponse({
          key: 'FS-2',
          fields: {
            summary: 'Broken',
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'It fails.' }],
                },
              ],
            },
            status: { name: 'Open' },
            reporter: { displayName: 'Rita' },
            assignee: null,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          comments: [
            {
              id: '1',
              author: { displayName: 'Greg' },
              created: '2026-01-01T00:00:00.000Z',
              jsdPublic: false,
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'internal note' }],
                  },
                ],
              },
            },
            {
              id: '2',
              author: { displayName: 'Rita' },
              created: '2026-01-02T00:00:00.000Z',
              jsdPublic: true,
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'customer reply' }],
                  },
                ],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transitions: [
            { id: '11', name: 'Resolve', to: { name: 'Resolved' } },
          ],
        })
      );

    const result = await handler.getTicket({ payload: { issueKey: 'FS-2' } });

    expect(result.ticket).toEqual({
      key: 'FS-2',
      summary: 'Broken',
      description: 'It fails.',
      status: 'Open',
      reporter: 'Rita',
      assignee: undefined,
    });
    expect(result.comments).toEqual([
      {
        id: '1',
        author: 'Greg',
        created: '2026-01-01T00:00:00.000Z',
        internal: true,
        body: 'internal note',
      },
      {
        id: '2',
        author: 'Rita',
        created: '2026-01-02T00:00:00.000Z',
        internal: false,
        body: 'customer reply',
      },
    ]);
    expect(result.transitions).toEqual([{ id: '11', name: 'Resolve', to: 'Resolved' }]);
  });

  it('extracts smart-link URLs and hard breaks from ADF', async () => {
    requestJira
      .mockResolvedValueOnce(
        jsonResponse({
          key: 'FS-4',
          fields: {
            summary: 'Newsletter',
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'line one' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'line two ' },
                    {
                      type: 'inlineCard',
                      attrs: { url: 'https://example.com/x' },
                    },
                  ],
                },
              ],
            },
            status: { name: 'Open' },
            updated: '2026-07-04T10:00:00.000+1200',
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ comments: [] }))
      .mockResolvedValueOnce(jsonResponse({ transitions: [] }));

    const result = await handler.getTicket({ payload: { issueKey: 'FS-4' } });

    expect(result.ticket.description).toBe(
      'line one\nline two https://example.com/x'
    );
    // The pane compares this against the queue's view to spot edits made
    // by other users.
    expect(result.ticket.updated).toBe('2026-07-04T10:00:00.000+1200');
  });

  it('degrades to empty lists when comments and transitions fail', async () => {
    requestJira
      .mockResolvedValueOnce(
        jsonResponse({ key: 'FS-3', fields: { summary: 'x', status: null } })
      )
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const result = await handler.getTicket({ payload: { issueKey: 'FS-3' } });

    expect(result.comments).toEqual([]);
    expect(result.transitions).toEqual([]);
  });
});

describe('submitReply', () => {
  it('requires an issueKey', async () => {
    await expect(handler.submitReply({ payload: {} })).rejects.toThrow(
      'requires an issueKey'
    );
  });

  it('posts a customer-visible comment as multi-paragraph ADF', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

    const result = await handler.submitReply({
      payload: { issueKey: 'FS-1', body: 'line one\nline two', internal: false },
    });

    expect(result).toEqual({ ok: true, commentPosted: true });
    const options = requestJira.mock.calls[0][1];
    const sent = JSON.parse(options.body);
    expect(sent.body.content).toHaveLength(2);
    expect(sent.properties).toBeUndefined();
  });

  it('marks internal notes with the sd.public.comment property', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

    await handler.submitReply({
      payload: { issueKey: 'FS-1', body: 'note', internal: true },
    });

    const sent = JSON.parse(requestJira.mock.calls[0][1].body);
    expect(sent.properties).toEqual([
      { key: 'sd.public.comment', value: { internal: true } },
    ]);
  });

  it('throws when the comment fails (nothing persisted, retry is safe)', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    await expect(
      handler.submitReply({ payload: { issueKey: 'FS-1', body: 'hi' } })
    ).rejects.toThrow('Comment failed: 500');
  });

  it('reports partial failure when the comment persisted but the transition failed', async () => {
    requestJira
      .mockResolvedValueOnce(jsonResponse({}, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 409 }));

    const result = await handler.submitReply({
      payload: { issueKey: 'FS-1', body: 'hi', transitionId: '11' },
    });

    expect(result).toEqual({
      ok: false,
      commentPosted: true,
      transitionError: 'Status change failed: 409',
    });
  });

  it('applies a transition without a comment', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));

    const result = await handler.submitReply({
      payload: { issueKey: 'FS-1', body: '', transitionId: '11' },
    });

    expect(result).toEqual({ ok: true, commentPosted: false });
    expect(requestJira).toHaveBeenCalledTimes(1);
  });
});

describe('assignIssue', () => {
  it("resolves 'me' to the invoking agent's accountId", async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));

    const result = await handler.assignIssue({
      payload: { issueKey: 'FS-1', accountId: 'me' },
      context: { accountId: 'agent-1' },
    });

    expect(result).toEqual({ ok: true });
    const sent = JSON.parse(requestJira.mock.calls[0][1].body);
    expect(sent).toEqual({ accountId: 'agent-1' });
  });

  it('unassigns with null accountId', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));

    await handler.assignIssue({
      payload: { issueKey: 'FS-1', accountId: null },
      context: { accountId: 'agent-1' },
    });

    const sent = JSON.parse(requestJira.mock.calls[0][1].body);
    expect(sent).toEqual({ accountId: null });
  });

  it('throws when the assign call fails', async () => {
    requestJira.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403 }));

    await expect(
      handler.assignIssue({
        payload: { issueKey: 'FS-1', accountId: 'other' },
        context: { accountId: 'agent-1' },
      })
    ).rejects.toThrow('Assign failed: 403');
  });
});

describe('getAssignableUsers', () => {
  it('maps users to accountId and displayName', async () => {
    requestJira.mockResolvedValueOnce(
      jsonResponse([
        { accountId: 'u1', displayName: 'Ann', emailAddress: 'a@x' },
        { accountId: 'u2', displayName: 'Bob' },
      ])
    );

    const result = await handler.getAssignableUsers({
      payload: { issueKey: 'FS-1' },
    });

    expect(result).toEqual([
      { accountId: 'u1', displayName: 'Ann' },
      { accountId: 'u2', displayName: 'Bob' },
    ]);
  });
});
