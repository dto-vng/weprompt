/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ForgeProject = {
  id: string;
  name: string;
  workspace: string;
  created_at: number;
  updated_at: number;
  last_opened_at?: number;
  instructions?: string;
};

export type CreateForgeProjectInput = {
  name: string;
  workspace: string;
  instructions?: string;
};

export type UpdateForgeProjectInput = {
  id: string;
  name?: string;
  workspace?: string;
  last_opened_at?: number;
  instructions?: string;
};

export type ProjectConversationExtra = {
  project_id?: string;
  workspace?: string;
  custom_workspace?: boolean;
};
