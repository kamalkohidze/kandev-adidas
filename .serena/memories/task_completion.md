# Task Completion

- Run focused tests for changed area first, e.g. `node --test test/marketing-workflow.test.js`.
- Run full suite before final: `npm test`.
- Check `git status --short` and mention unrelated/untracked artifacts separately.
- For API route changes, verify `src/platform/app.js` registration and module registry updates when relevant.
- Do not leave failing syntax checks for new ESM files; use `node --check <file.js>` when adding sizeable modules.