# Software Design Description

IEEE 1016-inspired internal guidance, unofficial.

## Document Control

- **Title:** htllm — Software Design Description
- **Version:** 1.0.0
- **Status:** Release candidate (describes the 1.0.0 code on `wip/release`)
- **Date of Issue:** 2026-11-23
- **Doc Baseline Commit:** 89cf2c6
- **Last Reviewed On:** 2026-11-23
- **Issuing Organization:** htllm (personal open-source project)
- **Authors:** @RJTPP, Claude Code
- **Body Organization:** Canonical multi-file SDD, pragmatic profile (eight base files)
- **Change History:**
  - 2026-11-23 v1.0.0. Rewritten from the code for 1.0.0:
    - Covers Chat and Workspace modes, the Knowledge library, the services layer, MCP,
      the DB v10 data model, the worker set and the release form.
    - Absorbs decisions D-1 to D-31 and the design notes from the 2026-11-23 review,
      which is removed (see git history).
    - Folds the implementation-deep extensions (§11–16) into the base files and removes
      them.
  - 2026-05-23 v0.2.0. Phase 2 update: HTTP providers, folders, command palette,
    thinking mode, Markdown rendering, storage manager, accent colors.
  - 2026-05-22 v0.1.0. Initial draft covering Phase 1.

The baseline is the code commit this text describes. The final merge to `dev` is a rebase,
which gives the same changes new commit hashes, so the baseline is re-pointed after that
merge (roadmap R4).

## Document Map

- [01. Introduction](01-introduction.md)
- [02-03. System Context and Concerns](02-03-system-context-and-concerns.md)
- [04. Architecture Overview](04-architecture-overview.md)
- [05. Viewpoints and Views](05-viewpoints-and-views.md)
- [06. Design Elements and Constraints](06-design-elements-and-constraints.md)
- [07-08. Traceability and Rationale](07-08-traceability-and-rationale.md)
- [09-10. Risks and Summary](09-10-risks-and-summary.md)
