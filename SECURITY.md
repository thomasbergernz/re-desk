# Security policy

## Reporting a vulnerability

Please do **not** open public issues for security vulnerabilities. Report them
privately via
[GitHub Security Advisories](https://github.com/thomasbergernz/junban-desk/security/advisories/new).

Include what you found, how to reproduce it, and the impact you believe it has.
We will acknowledge reports within 2 business days and keep you informed while
we investigate and fix.

## Full policy

Our incident handling, vulnerability management, and security controls are
documented in the customer-facing
[Junban Desk security policy](https://docs.junbandesk.com/security)
(source: [`docs/security.md`](docs/security.md)).

## Supported versions

Junban Desk is a Forge Cloud app: Marketplace installations are always on the
latest released version, so fixes ship to everyone as soon as they are
deployed. Self-managed installations (from source) should track `main`.

## Security model (summary)

- All Jira API calls run **as the logged-in user** (`asUser()`); Jira's own
  permission checks apply to every read and write.
- Least-privilege scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`,
  and `storage:app` (for the app's own per-project configuration).
- The app declares **no external egress** and persists only per-project
  configuration inside Atlassian — see the [privacy policy](docs/privacy.md) and
  the full [security policy](docs/security.md).
