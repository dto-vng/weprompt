/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StudioRouteCatalog } from '@/common/types/project/creativeStudioTypes';
import React from 'react';

import { EngineBar, getReadySelectedRoutes } from '../PhaseShell/phases/produce/EngineBar';

export type StudioModelBarProps = {
  catalog: StudioRouteCatalog | null;
  disabled?: boolean;
  onOpenSettings: (path: '/settings/model') => void;
};

/** Produce route summary. Per-project selection remains behind the existing Model Settings handoff. */
export const StudioModelBar: React.FC<StudioModelBarProps> = ({ catalog, disabled = false, onOpenSettings }) => {
  const routes = getReadySelectedRoutes(catalog);
  if (routes.length === 0) return null;

  return <EngineBar routes={routes} disabled={disabled} onOpenSettings={onOpenSettings} />;
};
