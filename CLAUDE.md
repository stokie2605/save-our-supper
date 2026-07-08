# CLAUDE.md

This file is lightweight project memory for AI-assisted work on Save Our Supper.
It is documentation only and does not affect the application runtime.

## 1. Git Workflow

- Main branch: main
- Commit style: short, practical messages that describe the user-facing change.
- Push policy: push only after checks pass or documentation-only changes are reviewed.
- Avoid unrelated cleanup while working on a focused change.

## 2. Project Purpose

Firebase-backed foodbank referral workflow with public tracking, partner referrals, volunteer operations, admin reporting, role gates, Firestore rules, and privacy-aware data handling.

Primary stack: React, TypeScript, Firebase Auth, Firestore, Firebase Hosting, Vitest, GitHub Actions.

## 3. Decisions

- Privacy and role isolation are non-negotiable.
- Keep demo access fenced to demo-agency data only.
- Do not weaken Firestore rules or expose personal referral data.
- Build UI around role-specific workflows: public, partner, volunteer, admin.

## 4. Session Mode

- Read this file and README.md before making non-trivial changes.
- Explain intent before multi-file edits.
- Run the relevant check command where practical: $(System.Collections.Hashtable.Check).
- Keep copy technical, plain, and recruiter-safe.
- Do not introduce secrets, real customer data, or unrelated commercial positioning.

## 5. Current State

### What got done

- Repository is part of the active portfolio set.
- README explains the project purpose and reviewer-facing evidence.
- Project memory has been added so future work starts with context.

### Where things stand

- Current positioning: Firebase-backed foodbank referral workflow with public tracking, partner referrals, volunteer operations, admin reporting, role gates, Firestore rules, and privacy-aware data handling.
- Review command/context: $(System.Collections.Hashtable.Check).

### Next

- Continue hardening tests around rules, demo data, and referral lifecycle edge cases.

### Blocked on

- Nothing.