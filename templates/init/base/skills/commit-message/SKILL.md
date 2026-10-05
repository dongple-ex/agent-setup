---
name: commit-message
description: Write a concise git commit message for the staged changes. Use when the user asks for a commit message or asks you to commit.
---
# Commit message

1. Run `git diff --staged` and read the changes.
2. Write a subject line under 72 characters in the imperative mood.
3. Add a short body only when the reason for the change is not obvious from the diff.
4. Show the message to the user before running `git commit`.
