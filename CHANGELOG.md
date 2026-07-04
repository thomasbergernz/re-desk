# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
From 2.1.0 on, version numbers follow the Forge app version assigned when the
release is deployed to production (`forge deploy -e production`), so the
changelog matches the app version site admins see. Earlier releases used
SemVer.

## [2.1.0] - 2026-07-04

### Added

- Draggable divider between the queue table and the detail pane: drag to
  resize (clamped 25–75%), double-click to reset, chosen split remembered
  across reloads

## [0.2.0] - 2026-07-04

### Added

- Loading spinners for the initial queue and ticket loads, an indeterminate
  progress bar while the table refreshes, and inline spinners on the Submit
  and Assign-to-me buttons
- URLs in descriptions and comments are collapsed into short clickable links
  (full URL on hover), taming email-origin tickets full of tracking links
- The selected ticket is remembered across page reloads and restored if it
  still needs action
- The detail pane refreshes itself when the queue poll sees the ticket
  change (another agent replied or transitioned it), preventing stale views
  and double handling

### Changed

- The detail pane reloads in the background after submitting or assigning,
  keeping the thread visible instead of flashing to a loading screen
- Smart links and hard breaks in ADF bodies now survive text extraction

### Fixed

- `npm run lint` now actually lints the frontend (`.jsx` needs `--ext` on
  ESLint 8) and no longer breaks on stray non-lintable files

## [0.1.0] - 2026-07-04

### Added

- "Needs action" queue table for JSM projects: every open ticket not waiting
  on the customer, oldest-updated first
- Queue filters: All / Unassigned / Assigned to me, remembered across reloads
- Inline ticket detail pane: collapsible description (state remembered) and
  full comment thread with internal notes marked
- Reply from the queue: customer-visible reply or internal note, with an
  optional status-at-submit transition dropdown
- Assignment controls: assign to me, assign to any assignable user, unassign
- Background auto-refresh every 30 seconds, paused while the tab is hidden
- Forge manifest template (`manifest.yml.example`) so forks register their
  own app id

[0.2.0]: https://github.com/thomasbergernz/re-desk/releases/tag/v0.2.0
[0.1.0]: https://github.com/thomasbergernz/re-desk/releases/tag/v0.1.0
