---
ticket_id: "tkt_ragcore_0320_corrective"
title: "Add-retrieval-quality-checks-and-corrective-routing"
agent: "codex"
done: false
goal: "The system can detect poor retrieval quality and take corrective action instead of blindly retrieving and answering."
---

## Tasks
- Add a retrieval-quality check before answer generation or before final context assembly.
- Define corrective actions for low-quality retrieval, such as retrying with a transformed query or switching retrieval behavior.
- Make retrieval-on-demand or adaptive retrieval available instead of retrieving blindly on every request.
- Add evaluation coverage for poor-retrieval cases and the corrective path outcome.

## Acceptance criteria
- The pipeline can detect at least one class of low-quality retrieval before answering.
- A corrective action path exists when retrieval quality is insufficient.
- Retrieval does not have to run in exactly the same way for every request.
- Corrective behavior is evaluated on known poor-retrieval examples.

## Tests
- Use a known low-quality retrieval case and verify the system detects the issue before final answer generation.
- Verify the corrective path changes retrieval behavior and improves the candidate set or answer grounding.
- Confirm standard requests can still follow the normal path when retrieval quality is acceptable.

## Notes
- Source: "Self-RAG — retrieval on demand plus self-reflection instead of blindly retrieving every time"; "CRAG — explicitly evaluates retrieval quality and triggers corrective actions when retrieved docs are poor."
- Constraints: Introduce corrective routing only after the core retrieval pipeline is in place and observable.
- Evidence: Self-RAG paper; CRAG paper; source file sections 1 and 5.
- Dependencies: TICKET-180-add-query-transforms-for-underspecified-requests.md; TICKET-240-separate-retrieval-evals-from-generation-evals.md; TICKET-260-add-online-tracing-and-monitoring-for-rag-flows.md
- Unknowns: Quality-check threshold; specific corrective actions; whether retrieval-on-demand is always preferable for the target workload.
