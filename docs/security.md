# Junban Desk security policy

[← Back to user guide](index.md)

**Effective date:** 7 July 2026

This page describes how **Junban Desk** is secured and how we handle security
issues. Junban Desk is a Jira Service Management app built entirely on Atlassian
[Forge](https://developer.atlassian.com/platform/forge/) and published on the
Atlassian Marketplace by **Collaboration Services** ("we", "us"). Because the app
runs entirely on Atlassian's infrastructure, it inherits Atlassian's platform
security controls; this page covers what we do on top of that. See also our
[privacy policy](privacy.md).

## Reporting a security issue

Please do **not** open public issues for security vulnerabilities. Report them
privately via
[GitHub Security Advisories](https://github.com/thomasbergernz/junban-desk/security/advisories/new),
or through our [support portal](https://confluenceservice-dev.atlassian.net/servicedesk/customer/portals).

Include what you found, how to reproduce it, the affected version, and the
impact you believe it has. We acknowledge reports within **2 business days** and
keep you informed through triage and remediation.

## How we handle security incidents

- **Intake and detection** — reports through the channel above, plus platform
  signals from Atlassian and Forge.
- **Triage** — we validate the report and assign a severity (impact combined
  with exploitability) within **2 business days** of confirmation.
- **Containment and remediation** — we develop and prioritise a fix by severity;
  critical issues are the top priority.
- **Deployment** — as a Forge Cloud app, fixes deploy to **all installations at
  once**; customers do not need to upgrade.
- **Notification** — if an incident affects customer data, we notify affected
  site administrators and cooperate with Atlassian under the Marketplace Partner
  Agreement and the Forge Data Processing Addendum, within the timelines those
  require.
- **Post-incident** — we run a root-cause review and track preventive follow-up
  actions.

## Vulnerability management

- **Reporting and triage** — as above: validate, reproduce, scope the affected
  versions, and rate severity.
- **Remediation targets** — critical: mitigate or fix as soon as possible;
  high: next patch release; medium and low: next scheduled release.
- **Dependencies** — third-party npm dependencies are tracked and updated; every
  change runs `forge lint`, ESLint, and the automated test suite before release;
  Forge SDKs are kept current.
- **Disclosure** — coordinated disclosure; we credit reporters on request once a
  fix has shipped.

## Key security controls

### Access control

- Every Jira API call runs **as the logged-in user** (`asUser`); Jira's own
  permission model governs every read and write, so the app can never exceed the
  acting user's permissions.
- **Least privilege** — the app requests only `read:jira-work`,
  `write:jira-work`, `read:jira-user`, plus `storage:app` for its own
  configuration.
- Changing project settings requires **project-admin** permission
  (`ADMINISTER_PROJECTS`) and an active license, enforced server-side.
- Forge tenant isolation keeps each customer's app data segregated.

### Data protection

- **No external egress** — the app declares none in its Forge manifest, and
  Atlassian enforces this at the platform level, so the app is technically
  incapable of sending data to non-Atlassian hosts.
- No external servers, database, analytics, or tracking.
- Only **per-project configuration** is stored, in the app's isolated Forge KVS
  store (scoped to the app and your site). Jira issue, comment, and user data is
  processed **in memory** to serve a request and is not retained.
- Encryption in transit and at rest, and data residency, are inherited from your
  Jira site.
- All app data is **deleted automatically when the app is uninstalled**.

### Monitoring and logging

- The app relies on Atlassian and Forge platform logging and runtime
  observability to investigate issues; it runs **no independent telemetry or
  external log shipping**.
- Atlassian monitors the underlying infrastructure — see the
  [Atlassian Trust Center](https://www.atlassian.com/trust).

### Secure development

- Changes go through review and an automated test and lint suite before release.
- Least-privilege scopes, no secrets in source, and configuration-only storage.

## Platform security

Junban Desk runs on Atlassian Forge and inherits Atlassian's certifications,
encryption, and sub-processor governance. See the
[Atlassian Trust Center](https://www.atlassian.com/trust) and
[Sub-Processors list](https://www.atlassian.com/legal/sub-processors).

## Contact

Security questions or reports:
[support portal](https://confluenceservice-dev.atlassian.net/servicedesk/customer/portals)
or [support@confluenceservice-dev.atlassian.net](mailto:support@confluenceservice-dev.atlassian.net).
