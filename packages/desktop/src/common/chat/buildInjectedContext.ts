/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** One labelled block of context to inject into a conversation's first turn. */
export type ContextLayer = {
  label: string;
  text: string;
};

/**
 * Label for the global (per-user) context layer.
 *
 * It must name the *user* as the subject. The Profile field invites first-person
 * text — its own placeholder reads "I work in HR at VNG. Prefer concise, formal
 * Vietnamese" — so a self-addressed label like "Your instructions" is read by the
 * model as a description of *itself*: a profile saying "I am a Head of AI Product
 * at VNG" produced an assistant that introduced itself as the Head of AI Product.
 *
 * Shared so the real injection (resolveInjectedContext) and the Profile page's
 * "What gets added to your chats" preview can never drift apart.
 */
export const GLOBAL_CONTEXT_LABEL = 'About the user and how they want you to respond';

/**
 * Compose ordered context layers into one plain, model-facing block.
 * Trims each layer, drops empties, returns '' when nothing survives.
 * Labels are intentionally model-facing (not i18n).
 */
export function buildInjectedContext(layers: ContextLayer[]): string {
  return layers
    .map((layer) => ({ label: layer.label.trim(), text: layer.text.trim() }))
    .filter((layer) => layer.text.length > 0)
    .map((layer) => `[${layer.label}]\n${layer.text}`)
    .join('\n\n');
}
