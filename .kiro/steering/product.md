---
inclusion: always
---

# Resurrected Reader — Product

Google Reader died in 2013. Resurrected Reader brings it back as an AI reading radar for AWS builders.

## Problem
AWS builders drown in sources: AWS News Blog, AWS ML Blog, Hacker News, changelogs, Devpost. No signal, only noise. Good posts get buried; reading never turns into action.

## Solution
A radar, not a feed reader:
1. Ingest RSS from builder sources.
2. Score every item 0–100 for signal (Kiro/AWS/agent relevance + recency).
3. High-signal items surface first; one click turns a read into a Kiro task (spec markdown).

## Users
- Solo AWS builders and startup founders who build with Kiro.
- Judges of Kiroween 2026, Resurrection category.

## Goals (Kiroween)
- Working app with a live public URL.
- Public GitHub repo with /.kiro at root (specs, steering, hooks).
- Demo video under 3 minutes.
- Honest write-up of how Kiro was used.
