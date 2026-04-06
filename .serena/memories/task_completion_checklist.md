# Task Completion Checklist

When finishing a change in this project, try to complete as many of these as the environment allows:

1. Ensure dependencies are installed (`npm install`).
2. Verify package / SDK compatibility if LM Studio has been updated since the last plugin revision.
3. Check for TypeScript issues (add/use `typescript` locally if compile verification is needed).
4. Run `lms dev` to confirm the plugin starts and reloads successfully.
5. Manually validate the main plugin flows:
   - no-file passthrough
   - new-file full-content injection path
   - retrieval path on larger files
   - citations added correctly
   - embedding model selection / auto-detect behavior
   - auto-unload behavior
   - abort handling during parsing/retrieval
6. Review `manifest.json` revision / metadata before publishing.
7. Use `git diff` to verify only intended files changed.
8. Publish with `lms push` only after local validation is satisfactory.

If a full runtime validation is not possible, explicitly note what was verified statically vs what still needs manual LM Studio testing.
