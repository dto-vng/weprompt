/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The visible knowledge folder inside a project workspace. Fixed English name,
// deliberately NOT localised: it is a path the agent reads in tool output and
// it must stay stable when a project moves between machines or locales.
export const KNOWLEDGE_FOLDER_NAME = 'Knowledge Base';

/**
 * Subfolder holding the extracted text of binary sources (.pdf/.docx/.xlsx),
 * whose originals the agent's file tools cannot read — `Read` on a PDF returns
 * "(binary file, N bytes)". Materializing the extraction here is what makes
 * whole-document questions answerable for those formats.
 *
 * Two independent scan rules currently keep these extractions from being
 * indexed as sources of their own: dotted entries are ignored, and v1 indexes
 * top-level files only. The dot is the one that survives: if nested-folder
 * support ever lands (an explicit follow-up), the subfolder rule disappears
 * and this leading dot becomes the only thing standing between the index and
 * a duplicate of every binary document's text.
 */
export const EXTRACTED_TEXT_DIR_NAME = '.text';

/**
 * Name of the built-in project-knowledge MCP server. Also the name persisted
 * in a conversation's frozen `extra.session_mcp_servers` snapshot, which is
 * what lets the renderer tell whether a chat was created with knowledge
 * search attached. It lives here rather than beside the other builtin-MCP
 * names in `process/resources/builtinMcp/constants.ts` because the renderer
 * may not import from `process/` — and a second copy of the literal is how
 * the persona-label bug happened.
 */
export const BUILTIN_KNOWLEDGE_NAME = 'aionui-project-knowledge';
