# Live Test Script for `rag-v2`

This script is meant to validate the current prompt-preprocessor behavior in LM Studio with minimal guesswork.

## Goal
Verify that the plugin:
- loads and registers cleanly
- handles the new answerability gate correctly
- still performs full-content injection for small inputs
- still performs retrieval for larger inputs
- remains grounded when a request is not answerable from attached files

---

## Recommended setup

### 1. Start the plugin in dev mode
From the project root:

```bash
/home/user/.lmstudio/bin/lms dev
```

Expected terminal output should include:
- `build finished, watching for changes...`
- `[PromptPreprocessor] Register with LM Studio`

### 2. Open LM Studio chat
Use any model that supports normal chat prompting.

### 3. Plugin config for this pass
Use these settings unless a case says otherwise:
- `Embedding Model`: `Auto-Detect (Use first loaded/available)`
- `Manual Model ID`: empty
- `Auto-Unload Model`: off
- `Retrieval Limit`: `3`
- `Retrieval Affinity Threshold`: `0.5`
- `Answerability Gate`: on
- `Gate Confidence Threshold`: `0.7`
- `Ambiguous Query Behavior`: `Ask for clarification`

---

## Suggested test documents
Ready-to-use fixtures are included in this repo under `manual-tests/fixtures/`.
You can attach those directly in LM Studio instead of creating your own files.

Prepare these files before testing if you want custom variants instead:

### Small doc
A short text file that easily fits in context.
Example contents:

```text
Project Phoenix launch date: June 12, 2026.
Project owner: Maya Chen.
Primary goal: migrate the billing service without downtime.
```

File name suggestion: `small-project-note.txt`

### Larger doc
A longer document with multiple sections so retrieval is likely.
Good options:
- a long markdown design doc
- a PDF manual
- a multi-page meeting transcript

File name suggestion: `large-architecture-doc.md`

### Second reference doc
A second small doc to force ambiguity across multiple files.
Example contents:

```text
Project Atlas launch date: August 4, 2026.
Project owner: Leo Park.
Primary goal: consolidate analytics pipelines.
```

File name suggestion: `small-atlas-note.txt`

---

## Test cases

## Case 1 — Startup sanity
### Action
Start `lms dev` and install the plugin if needed.

### Expected result
- plugin installs successfully
- dev server starts successfully
- no startup exception appears in terminal

### Failure signals
- install errors
- registration errors
- prompt preprocessor crashes on startup

---

## Case 2 — Casual prompt should skip retrieval
### Attach
- `small-project-note.txt`

### Prompt
```text
thanks
```

### Expected result
- model responds conversationally
- no retrieval-oriented failure occurs
- no obvious document-grounding wrapper appears in the visible response
- plugin should effectively pass the message through

### What to watch in logs
Look for a debug decision similar to:
- `no-retrieval-needed`

---

## Case 3 — Ambiguous prompt across multiple files
### Attach
- `small-project-note.txt`
- `small-atlas-note.txt`

### Prompt
```text
what about this?
```

### Expected result
- model asks one concise clarification question
- response should help the user disambiguate between the available files
- it should not confidently answer with facts from only one file

### Good result example
- asks which project or which file the user means

### Bad result example
- hallucinates an answer
- chooses one file without signaling uncertainty

### What to watch in logs
Look for a debug decision similar to:
- `ambiguous`

---

## Case 4 — Likely unanswerable from attached files
### Attach
- `small-project-note.txt`

### Prompt
```text
what is the current weather in chicago?
```

### Expected result
- response should clearly state that the attached file does not contain that information
- response should avoid guessing
- response may invite the user to attach a relevant document or restate the question in terms of the provided files

### Bad result example
- gives a weather answer
- invents external information not present in the file

### What to watch in logs
Look for a debug decision similar to:
- `likely-unanswerable`

---

## Case 5 — Small file should use full-content injection path
### Attach
- `small-project-note.txt`

### Prompt
```text
who owns project phoenix and when does it launch?
```

### Expected result
- correct answer: `Maya Chen` and `June 12, 2026`
- no retrieval failure
- likely follows the full-content injection path because the file is tiny

### Failure signals
- wrong owner or date
- says it cannot find the answer
- runtime error during preprocessing

### What to watch in logs
Look for a strategy decision similar to:
- `inject-full-content`

---

## Case 6 — Large file should use retrieval path
### Attach
- `large-architecture-doc.md`

### Prompt
Ask a question whose answer appears in only one or two sections of the large document.
Example:

```text
what database is used by the session service and what tradeoff is mentioned?
```

### Expected result
- answer should be grounded in the document
- retrieval should succeed without crashing
- answer should reflect the matching section instead of summarizing the whole file indiscriminately

### Failure signals
- preprocessing crash
- clearly irrelevant answer
- response behaves as if no file were attached

### What to watch in logs
Look for a strategy decision similar to:
- `retrieval`

---

## Case 7 — Best-effort ambiguous behavior config
### Config change
Set:
- `Ambiguous Query Behavior`: `Attempt best effort`

### Attach
- `small-project-note.txt`
- `small-atlas-note.txt`

### Prompt
```text
what about this?
```

### Expected result
- plugin should not force a clarification wrapper
- downstream behavior may still be uncertain, but the gate should not intercept with a clarification instruction

### What to watch in logs
- gate may still classify as `ambiguous`
- returned behavior should continue instead of forcing clarification text

---

## Case 8 — Gate off fallback behavior
### Config change
Set:
- `Answerability Gate`: off

### Attach
- `small-project-note.txt`

### Prompt
```text
what is the current weather in chicago?
```

### Expected result
- plugin should behave like the pre-gate system
- useful as a regression comparison against Case 4

### Why this matters
This confirms that any changed behavior is coming from the new gate rather than from unrelated retrieval issues.

---

## Fast pass order
If you only want the minimum set, run these in order:
1. Case 1 — startup sanity
2. Case 3 — ambiguous prompt
3. Case 4 — likely unanswerable
4. Case 5 — small-file grounded answer
5. Case 6 — large-file retrieval

---

## Result capture template
Copy this into notes while testing:

```text
Case:
Prompt:
Files attached:
Config overrides:
Observed visible response:
Observed terminal/debug output:
Pass/Fail:
Notes:
```

---

## Recommended next action after running this script
- If Cases 3 and 4 behave well, keep the gate enabled by default.
- If Case 3 is too aggressive, raise the ambiguity threshold or narrow the ambiguity heuristics.
- If Case 4 is too aggressive, narrow the time-sensitive or external-information patterns.
- If Cases 5 or 6 regress, inspect the preprocessor control flow before changing heuristics.
