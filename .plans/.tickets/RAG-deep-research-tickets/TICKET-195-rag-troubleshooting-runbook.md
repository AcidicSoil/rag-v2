---
ticket_id: "tkt_738df06fa96174d5"
title: "Publish-a-retrieval-core-troubleshooting-runbook"
agent: "codex"
done: false
goal: "Operators have a concrete runbook for isolating wrong answers, drift, eval-driven cost spikes, and reranker failures."
---

## Tasks
- Document the common failure modes called out in the source, including unsupported answers, quality drift, eval-driven latency or cost spikes, and reranker runtime failures.
- Document the isolation steps in order: trace the request, replay against frozen indices and fixed model versions, tune retrieval before generation, and then tighten answer constraints if retrieval is correct.
- Document production dependency handling expectations for rerankers, including version pinning, mirrored artifacts, or fallback behavior where applicable.

## Acceptance criteria
- A written runbook exists for the failure modes explicitly named in the source.
- The runbook provides ordered isolation steps instead of generic troubleshooting advice.
- The runbook captures reranker dependency handling expectations.

## Tests
- Review the runbook and verify it includes the four named symptom classes from the source.
- Verify the runbook orders the isolation steps from tracing to offline replay to retrieval tuning to answer-path tightening.
- Verify the reranker section includes versioning or fallback guidance.

## Notes
- Source: Troubleshooting-Checklist-and-Runbook section.
- Constraints: Incident ownership and escalation policy are not provided.
- Evidence: Source report section Troubleshooting-Checklist-and-Runbook.
- Dependencies: TICKET-160-rag-evaluation-and-regression-gates.md; TICKET-170-rag-observability.md; TICKET-180-embedding-versioning-and-drift-migration.md.
- Unknowns: On-call structure and deployment environment are not provided.
