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
