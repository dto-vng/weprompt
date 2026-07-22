/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildProjectHomePath, resolveProjectClickTarget } from '@renderer/pages/conversation/projects/projectNavigation';

describe('projectNavigation', () => {
  it('builds the home path for an id', () => {
    expect(buildProjectHomePath('p1')).toBe('/project/p1');
  });

  it('encodes ids that need escaping', () => {
    expect(buildProjectHomePath('a/b')).toBe('/project/a%2Fb');
  });

  it('routes a saved project to its home', () => {
    expect(resolveProjectClickTarget({ project_id: 'p1', workspace: '/w/a' })).toEqual({ kind: 'home', path: '/project/p1' });
  });

  it('routes a legacy workspace (no project_id) to a scoped chat', () => {
    expect(resolveProjectClickTarget({ workspace: '/w/a' })).toEqual({ kind: 'chat', workspace: '/w/a' });
  });
});
