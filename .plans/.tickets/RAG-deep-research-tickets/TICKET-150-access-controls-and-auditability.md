---
ticket_id: "tkt_09cf89b72c4fd567"
title: "Enforce-retrieval-time-access-controls-and-auditability"
agent: "codex"
done: false
goal: "The retrieval core enforces access boundaries for sensitive data and records enough activity for audit and incident review."
---

## Tasks
- Implement retrieval-time ACL filtering for documents or rows as supported by the chosen data layer.
- Enforce tenant isolation where the deployment is multi-tenant.
- Add audit logging for retrieval and access activity relevant to sensitive or regulated data handling.
- Apply PII handling safeguards consistent with the source guidance, including minimization and protected storage or transport where applicable.

## Acceptance criteria
- Queries only return content authorized for the caller.
- Cross-tenant data is not retrievable from another tenant context.
- Audit records exist for retrieval activity on sensitive data paths.

## Tests
- Query the same corpus with two different authorization contexts and verify the result sets differ according to access rules.
- Attempt cross-tenant access and verify no out-of-tenant documents are returned.
- Review retrieval audit records and verify they capture access events needed for later examination.

## Notes
- Source: "Retrieval-time ACL filtering + tenant isolation + audit logs" and PII/privacy guidance.
- Constraints: Regulatory scope such as HIPAA or GDPR applicability is not provided.
- Evidence: Source report sections PII handling and privacy; Access control and governance; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-100-retrieval-core-contracts.md; TICKET-110-ingestion-and-indexing-stability.md.
- Unknowns: Concrete identity provider, tenant model, and retention policy are not provided.
