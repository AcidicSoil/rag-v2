---
ticket_id: "tkt_ragcore_0100_ingestion"
title: "Preserve-structured-ingestion-and-citation-anchors"
agent: "codex"
done: false
goal: "Source documents are ingested with layout, table/image handling, and stable citation anchors preserved so retrieval quality is not capped by parsing loss."
---

## Tasks
- Implement or configure a layout-aware parsing path for PDFs and other layout-heavy documents.
- Preserve document structure during ingestion, including headings, sections, pages, and other useful anchors.
- Handle tables and images separately instead of flattening them into undifferentiated text.
- Store citation-relevant metadata such as page, section, and source identifiers with each ingested unit.
- Add ingestion validation checks for PDFs, tables, charts, scans, and other known difficult inputs.

## Acceptance criteria
- Ingested documents retain enough structure to trace retrieved content back to a stable source location.
- Tables and images are preserved or represented in a way that does not silently discard their content.
- Retrieval units include source metadata needed for grounding and citation.
- At least one validation path exists for layout-heavy and scan-derived content.

## Tests
- Ingest representative PDFs, scans, and table-heavy files and verify that headings, pages, and source anchors are preserved.
- Retrieve content from a table-containing document and verify the returned item still points to the correct source location.
- Compare raw source content against stored retrieval units and confirm that layout-critical information was not flattened away without review.

## Notes
- Source: "Bad ingestion ruins everything"; "layout-aware parsing"; "preserving structure"; "separate handling for tables/images"; "storing citation anchors/page metadata."
- Constraints: Do not assume a specific parser vendor or file format beyond what the source explicitly mentions.
- Evidence: LlamaParse docs; Unstructured PDF table extraction docs; source file sections 2A and 3.
- Dependencies: Not provided.
- Unknowns: Exact parser choice; supported file type matrix; storage schema for source anchors.
