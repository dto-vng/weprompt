# Vendor notes

- Source: https://github.com/anthropics/skills (skills/pptx)
- Source commit: fa0fa64bdc967915dc8399e803be67759e1e62b8
- License found: Proprietary "source-available" Anthropic license at `skills/pptx/LICENSE.txt` in the clone (identical text is also used for `skills/docx`, `skills/pdf`, and `skills/xlsx`). It grants use only under Anthropic's Consumer/Commercial Terms of Service and explicitly adds restrictions on top of that agreement: no extracting or retaining copies of the materials outside the Services, no reproduction, no derivative works, no distribution/sublicensing/transfer to any third party, and no reverse engineering. The repository's own `README.md` corroborates this, stating that the document-creation skills (`docx`, `pdf`, `pptx`, `xlsx`) are "source-available, not open source," in contrast to the majority of the other skills in the repo (e.g. `canvas-design`, `theme-factory`), which are licensed under Apache License 2.0.
- PORT_ALLOWED: no
- Decision: Write original prose (Approach C fallback) — the pptx skill's license forbids reproduction, derivative works, and redistribution of its materials, so no text or structure may be copied from the clone; only the general concept of what a pptx-authoring skill needs may inform original guidance written from scratch.
