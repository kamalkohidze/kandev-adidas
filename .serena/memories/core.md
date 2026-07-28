# Core

- Headless UCO CRM retail platform; contracts documented in `docs/architecture.md`, `docs/data-contracts.md`, `docs/api-contracts.md`, `docs/events.md`.
- Runtime code is under `src/`; modules register API routes through `src/platform/app.js`.
- Use canonical domain arrays on platform data; do not create duplicate Customer/Product/Transaction schemas inside modules.
- Marketing submodules live under `src/modules/marketing`: segments, lifecycle, cross-sell, workflow.
- Read module-specific docs before changing a bounded context: segmentation, lifecycle, cross-sell, marketing workflow.

References: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.