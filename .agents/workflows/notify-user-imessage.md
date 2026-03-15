---
description: Send an iMessage notification to the user when their attention is needed
---

# Send iMessage Notification

Use this workflow to send an iMessage to the user's phone when you need their attention during long-running tasks.

## When to Use

- A deployment finishes and needs verification
- You are blocked on a decision or user input
- A long-running task completes
- Tests fail unexpectedly and you need guidance

## How to Send

// turbo

1. Run the following command, replacing the message content as appropriate:

```bash
osascript -e "tell application \"Messages\" to send \"🚀 [YOUR MESSAGE HERE]\" to buddy \"+1$(cat ~/.imessage_phone)\""
```

## Message Guidelines

- Keep messages concise (1-2 sentences)
- Start with an emoji for quick visual parsing
- Include the context (e.g., issue number, task name)
- Examples:
  - `🚀 Deployment complete for #79b — please verify on the live site`
  - `🛑 Tests failing after refactor — need your input on approach`
  - `✅ All tasks in sprint complete — ready for review`
