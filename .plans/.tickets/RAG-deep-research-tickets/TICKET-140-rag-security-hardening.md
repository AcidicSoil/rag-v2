---
ticket_id: "tkt_1625e80f7975e52c"
title: "Harden-the-retrieval-path-against-poisoning-and-prompt-injection"
agent: "codex"
done: false
goal: "Retrieved content is treated as untrusted data and the retrieval path is hardened against prompt injection, poisoning, and unsafe tool execution."
---

## Tasks
- Document a threat model for prompt injection and retrieval poisoning for the retrieval core.
- Sanitize and scope retrieved content so it is handled as data rather than executable instructions.
- Enforce allowlisted tool or action schemas and strict argument validation where retrieval is connected to tools or plugins.
- Add policy checks or equivalent safe-completion boundaries so retrieved or model-generated content cannot directly trigger unsafe writes.

## Acceptance criteria
- A threat model exists for prompt injection and retrieval poisoning.
- Retrieved documents cannot override system or application instructions on the grounded path.
- Tool-connected retrieval flows reject out-of-policy or schema-invalid actions.

## Tests
- Inject adversarial instructions into a fixture document and verify the grounded answer path does not follow them as instructions.
- Attempt a tool-connected request with invalid or non-allowlisted arguments and verify it is blocked.
- Review the threat model and verify it covers indirect prompt injection and retrieval poisoning.

## Notes
- Source: "Treat retrieved content as untrusted data", "add allowlists and policy checks", and prompt-injection / retrieval-poisoning sections.
- Constraints: Specific sanitization implementation details are not provided.
- Evidence: Source report sections Threat-Model-For-RAG-Integrations; Mitigations-That-Actually-Work-At-Scale; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-130-query-transforms-and-grounding-contract.md.
- Unknowns: Whether the target deployment includes MCP or other plugin surfaces is not provided.
