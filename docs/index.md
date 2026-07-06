Junban (順番 — means “order,” “sequence,” or “the proper arrangement of things.” It is used to refer to the prescribed or logical order in which items, actions, or events should occur.)

Junban Desk replaces the default Jira Service Management (JSM) queue views with a single,
focused agent workspace: a "needs action" ticket table on the left and an inline
ticket detail pane on the right. Agents triage, reply, and resolve without ever
leaving the queue, a Zendesk-style agent workspace for JSM. 

- [Installation and setup](install.md)
- [Support](support.md)
- [Privacy policy](privacy.md)

## The workspace

Open any JSM project or space and choose **Junban Desk** in the 
sidebar under Queues. The workspace has two panes; drag the divider between
them to resize, or double-click it to reset.

![Junban Desk workspace](workspace.png)

### The "needs action" queue

The table shows every open ticket (work item) in the project that is **not waiting on the
customer**, oldest update first — so the ticket that has waited longest is at
the top. Tickets that are resolved or in a "Waiting for customer" status are
hidden automatically.

The queue refreshes itself every 30 seconds in the background (paused while the
browser tab is hidden), and you can refresh manually with the **Refresh**
button.

### Filters

Three filters, applied instantly and remembered across reloads:

- **All** — every needs-action ticket
- **Unassigned** — tickets nobody owns yet
- **Assigned to me** — your tickets

### Ticket detail pane

Select a ticket to open it inline:

- **Description** — collapsible, with long pasted URLs shortened
- **Comment thread** — the full conversation, oldest first. Internal agent
  notes are visually marked and never visible to the customer.
- **Assignment** — assign the ticket to yourself or any assignable user from
  the dropdown, or unassign it.

If someone else updates the ticket while you have it open, the pane notices on
the next background refresh and reloads itself, so you never reply to a stale
thread.

### Replying

Type your reply at the bottom of the detail pane and pick:

- **Reply to customer** — a public comment the customer sees
- **Internal note** — visible to agents only

Next to the submit button is a **status-at-submit** dropdown (Zendesk style):
leave the status unchanged, or pick any workflow transition to apply together
with your reply — for example "Reply and set to *Waiting for customer*" in one
click.

## Permissions

Every action Junban Desk performs runs **as you**, through Jira's own REST API.
You can only see and do what your Jira permissions already allow — the app adds
no permissions of its own and never acts on your behalf when you are not using
it.
