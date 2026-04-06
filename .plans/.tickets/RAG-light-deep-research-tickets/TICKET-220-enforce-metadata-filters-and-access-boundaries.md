---
ticket_id: "tkt_ragcore_0220_acl"
title: "Enforce-metadata-filters-and-access-boundaries"
agent: "codex"
done: false
goal: "Retrieval respects tenant boundaries, metadata filters, and tool-surface authorization so cross-tenant or over-broad data access is blocked."
---

## Tasks
- Add retrieval-time metadata filters for tenant, scope, or access-control boundaries.
- Ensure index or datastore configuration supports tenant-aware partitioning or equivalent isolation.
- Enforce authorization at the retrieval and tool/protocol layer for any exposed app, client, MCP, or plugin surface.
- Apply least-privilege and explicit-consent handling where the retrieval surface can reach private systems.

## Acceptance criteria
- Retrieval results are constrained by access metadata rather than relying on post-hoc filtering.
- Cross-tenant leakage is blocked by the retrieval path itself.
- Exposed tool surfaces require authorization consistent with the data they can access.
- Access boundaries are enforced consistently across the supported interaction surfaces.

## Tests
- Query across at least two isolated scopes and verify results do not cross boundaries.
- Attempt retrieval without the required authorization context and verify access is denied or narrowed correctly.
- Inspect retrieved result metadata and verify scope or tenant attributes are present and applied.

## Notes
- Source: "Multitenancy and ACLs are often bolted on too late"; "metadata filters at retrieval time"; "tenant-aware sharding/index config"; "auth at the tool/protocol layer"; "least privilege and explicit consent."
- Constraints: Do not bolt on ACL filtering only after retrieval.
- Evidence: Qdrant multitenancy docs; MCP authorization/security docs; OpenAI data controls; Apps SDK security/privacy notes; source file sections 2I and 3.
- Dependencies: TICKET-140-add-hybrid-retrieval-with-lexical-and-dense-fusion.md
- Unknowns: Tenant model; auth provider; supported external surfaces and trust boundaries.
