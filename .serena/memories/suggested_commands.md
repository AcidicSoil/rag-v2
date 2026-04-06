# Suggested Commands

## Basic filesystem / shell (Linux)
- `pwd`
- `ls`
- `find . -maxdepth 3 -type f`
- `grep -R "pattern" src`
- `git status`
- `git diff`

## Install / restore dependencies
- `npm install`
- If LM Studio CLI is not on PATH: `npx lmstudio install-cli`

## Plugin development
- `lms dev`
- `lms dev --install`
- `lms push`
- `lms push --private`

## Dependency inspection
- `npm ls --depth=0`
- `npm outdated`

## Manual validation ideas
- Start LM Studio / local daemon as needed
- Run the plugin with `lms dev`
- Attach text/doc/pdf files in LM Studio chat and verify:
  - config UI loads
  - full-content injection path works
  - retrieval path works
  - citations appear
  - embedding model auto-detect/manual override works
  - abort/unload behavior is graceful

## Notes
- The repo currently has no explicit `test`, `lint`, or `build` npm scripts.
- The repo also does not currently include `typescript` as a dev dependency, so `tsc --noEmit` is not available until added.
