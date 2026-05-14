# ADR-000: ADR Format

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Solin

## Context

We need a lightweight way to record architectural decisions as the project evolves. These records should be immutable once written — you can supersede but not edit.

## Decision

Use numbered markdown files in `docs/adr/` with this format:
- **Title** as H1
- **Date**, **Status** (Proposed / Accepted / Superseded / Deprecated), **Author**
- **Context**: what prompted the decision
- **Decision**: what we chose
- **Alternatives considered**: what we rejected and why
- **Consequences**: tradeoffs we accept

Numbering is sequential: `001-`, `002-`, etc.

Status transitions: Proposed → Accepted → (optionally Superseded by ADR-NNN)

## Alternatives Considered

- Inline comments in code: too scattered, no history
- Wiki/Notion: external, breaks locality
- Single design doc: doesn't scale, hard to find specific decisions

## Consequences

- Every structural decision gets a permanent record
- Contributors can understand "why" without asking
- Superseded decisions still exist for context
