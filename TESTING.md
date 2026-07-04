# Testing

Framework: [Vitest](https://vitest.dev/) 4.x.

Run:

```bash
npm test
```

## Layout

- `src/resolvers/index.test.js` — resolver unit tests. The Forge SDK
  (`@forge/resolver`, `@forge/api`) is mocked; tests call resolver functions
  directly through the exported handler map and assert on the Jira REST
  requests and mapped responses.

## Conventions

- Colocate tests next to the code: `foo.js` → `foo.test.js`
- Mock all Forge/Jira boundaries — tests never hit the network
- Test behavior, not existence: assert mapped shapes, request bodies, and
  error semantics (e.g. partial-failure contract of `submitReply`)
- When fixing a bug, add a regression test that sets up the exact
  precondition that triggered it

## What is not covered

- Custom UI React components (`static/queue/src`) — verified manually in the
  browser; no jsdom harness yet
- Live Jira behavior (workflow transitions, JSM comment visibility) — covered
  by manual test matrix in the QA report
