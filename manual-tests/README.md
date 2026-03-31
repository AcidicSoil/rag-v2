# Manual test fixtures

This folder contains ready-to-attach files for `LIVE_TEST_SCRIPT.md`.

## Files
- `fixtures/small-project-note.txt`
- `fixtures/small-atlas-note.txt`
- `fixtures/large-architecture-doc.md`

## Suggested pairings
- Use `small-project-note.txt` for casual, no-match, and small-file grounding tests.
- Use both small note files for ambiguity tests.
- Use `large-architecture-doc.md` for retrieval tests.

## Expected answers
### `small-project-note.txt`
- Project owner: `Maya Chen`
- Launch date: `June 12, 2026`
- Primary goal: `migrate the billing service without downtime`

### `small-atlas-note.txt`
- Project owner: `Leo Park`
- Launch date: `August 4, 2026`
- Primary goal: `consolidate analytics pipelines`

### `large-architecture-doc.md`
- Session service database: `PostgreSQL`
- Session service tradeoff: `transactional consistency and easier operational visibility, but more write latency than an in-memory cache-first design`
- Analytics database: `ClickHouse`
