# Plugin Update Summary — 2026-03-30

## Goal
Repair the LM Studio plugin after several months without updates, focusing on likely SDK/type drift and local environment issues.

## Changes made
- Restored local dependencies with `npm install`.
- Updated `src/promptPreprocessor.ts`:
  - Added missing `LLMDynamicHandle` type import from `@lmstudio/sdk`.
  - Updated downloaded embedding-model auto-detect logic to use the typed SDK API:
    - changed `ctl.client.system.listDownloadedModels()` to `ctl.client.system.listDownloadedModels("embedding")`
    - removed reliance on `identifier` for downloaded model metadata
    - now selects/loads downloaded embedding models using `modelKey`
  - Kept existing behavior of preferring embedding models whose metadata suggests embedding usage, then falling back to the first downloaded embedding model.
  - Fixed context measurement for strategy selection by appending the current user prompt to the pulled history before calling `model.applyPromptTemplate(...)`.

## Why this was needed
- The repo had no installed dependencies, so it could not be validated locally.
- TypeScript surfaced two concrete issues:
  1. `LLMDynamicHandle` was used but not imported.
  2. The code assumed downloaded models expose `identifier`, but current SDK typings for downloaded model info do not guarantee that field.
- Live runtime testing surfaced an additional bug:
  3. During `chooseContextInjectionStrategy()`, the plugin called `measureContextWindow()` with `ctl.pullHistory()` only, without adding the active user message. Some model prompt templates then failed with `Error rendering prompt with jinja template: "No user query found in messages."`.

## Verification performed
- `npm install` completed successfully.
- TypeScript verification passed with:
  - `npx -y -p typescript tsc --noEmit`
- Confirmed LM Studio CLI is available and `lms dev --help` works.
- Live runtime validation confirmed the prompt-template error was fixed after appending the current user prompt into the temporary chat used for context measurement.

## Runtime symptom and fix
### Symptom
LM Studio dev server showed:
- `Error rendering prompt with jinja template: "No user query found in messages."`
- stack trace pointed to:
  - `measureContextWindow(...)`
  - `chooseContextInjectionStrategy(...)`
  - `preprocess(...)`

### Root cause
`model.applyPromptTemplate(ctx)` was called on a chat history that did not include the current user turn being preprocessed.

### Fix
In `chooseContextInjectionStrategy()`:
- after `const ctx = await ctl.pullHistory();`
- added `ctx.append("user", originalUserPrompt);`

## Current status
- Source compiles cleanly.
- The previously observed prompt-template runtime error is fixed.
- Plugin is at least partially validated in a live LM Studio run.

## Remaining recommended validation
Continue manual LM Studio checks for:
- small-file full-content injection
- large-file retrieval flow
- citations rendering
- manual embedding model override
- auto-detect behavior across loaded/downloaded models
- auto-unload behavior
