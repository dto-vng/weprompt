/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';

import styles from './ProjectHomePage.module.css';
import ProjectChatList from './components/ProjectChatList';
import ProjectFilesCard from './components/ProjectFilesCard';
import ProjectHeader from './components/ProjectHeader';
import ProjectInstructionsCard from './components/ProjectInstructionsCard';
import ProjectKnowledgeCard from './components/ProjectKnowledgeCard';
import ProjectNewChatComposer from './components/ProjectNewChatComposer';
import { useProjectChats } from './hooks/useProjectChats';
import { useProjectHubLayout } from './hooks/useProjectHubLayout';
import { useProjectHome } from './hooks/useProjectHome';

/**
 * Per-project Home page scaffold.
 *
 * Resolves the project by route id and renders either a whole-page not-found
 * state, or the two-column hub layout — a full-width header on top, a main
 * column (composer + chats) and a right rail (instructions + knowledge +
 * files) that collapses to a single stacked column on narrow viewports. The
 * header slot renders `ProjectHeader` (C2), the composer slot renders
 * `ProjectNewChatComposer` (C6), the chats slot renders `ProjectChatList`
 * (C3), the instructions slot renders `ProjectInstructionsCard` (C4), the
 * knowledge slot renders `ProjectKnowledgeCard` (the project's retrieval
 * knowledge base — add/list/retry/remove sources), and the files slot
 * renders `ProjectFilesCard` (C5).
 *
 * `useProjectHome` resolves synchronously from localStorage, so there is no
 * async page-level loading gap — a page-level loading skeleton would be dead
 * code. The mockup's loading skeleton belongs to the async Files card
 * (`ProjectFilesCard`, which loads its tree via IPC and shows its own
 * loading state), not this scaffold.
 */
const ProjectHomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { project, notFound } = useProjectHome(id);
  const chats = useProjectChats(project);
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const { hubRef, isHubStacked } = useProjectHubLayout();

  if (notFound || !project) {
    return (
      <div
        data-testid='project-not-found'
        className='flex flex-col items-center justify-center gap-12px h-full p-24px text-center'
      >
        <h1 className='text-18px font-600 text-t-primary'>{t('conversation.projectHome.notFoundTitle')}</h1>
        <p className='text-14px text-t-secondary max-w-360px'>{t('conversation.projectHome.notFoundBody')}</p>
        <Button type='primary' onClick={() => navigate('/guid')}>
          {t('conversation.projectHome.backHome')}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid='project-home' className={styles.page}>
      <div data-testid='project-header-slot' className={styles.headerSlot}>
        <ProjectHeader project={project} />
      </div>
      <div
        ref={hubRef}
        data-testid='project-hub'
        className={classNames(styles.hub, (isMobile || isHubStacked) && styles.hubMobile)}
      >
        <div className={styles.main}>
          <div data-testid='project-composer-slot'>
            <ProjectNewChatComposer project={project} />
          </div>
          <div data-testid='project-chats-slot'>
            <ProjectChatList chats={chats} />
          </div>
        </div>
        <div className={styles.rail}>
          <div data-testid='project-instructions-slot'>
            <ProjectInstructionsCard project={project} />
          </div>
          <div data-testid='project-knowledge-slot'>
            <ProjectKnowledgeCard project={project} />
          </div>
          <div data-testid='project-files-slot'>
            <ProjectFilesCard project={project} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHomePage;
