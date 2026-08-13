/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRouteCatalog } from '@/common/types/project/creativeStudioTypes';

const MEDIA_ROLES = ['image', 'video'] as const;

export type StudioRouteAdoption = {
  role: (typeof MEDIA_ROLES)[number];
  choiceId: string;
};

/**
 * Resolves the media routes a project may take on without being asked.
 *
 * Produce sends engine work to Model Settings, which binds engines for the
 * whole workspace and never writes a project route, so a project can hold no
 * renderable route long after the workspace has one. Adoption repairs only the
 * unambiguous case: the role has no route that can render — never chosen, or
 * chosen and no longer resolvable — and the catalog offers exactly one
 * compatible option, which is therefore the only route that could ever have
 * rendered it. Roles with a live choice, or with rival options, are left alone
 * rather than spending a render on a guess.
 *
 * Roles are reported together in a stable order; the caller persists them one
 * at a time, so a role that cannot be adopted never blocks the other.
 */
export const resolveSoleRouteAdoptions = (catalog: StudioRouteCatalog | null): StudioRouteAdoption[] => {
  if (catalog === null) return [];
  return MEDIA_ROLES.flatMap((role) => {
    const media = catalog[role];
    if (media.status === 'ready' || media.selectedRoute !== null) return [];
    const [option, ...rivals] = media.options;
    if (option === undefined || rivals.length > 0) return [];
    if (option.kind !== role || option.health === 'unavailable') return [];
    return [{ role, choiceId: option.choiceId }];
  });
};
