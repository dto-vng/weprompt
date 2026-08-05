import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { MovieBoard } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { StudioProjectSummary } from '@/common/types/project/creativeStudioTypes';
import studioType from '@renderer/pages/studio/StudioTypography.module.css';
import { isElectronDesktop } from '@renderer/utils/platform';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderStudioEntryProps = {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
  onProjectClick: (project: StudioProjectSummary) => void;
};

const SiderStudioEntry: React.FC<SiderStudioEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
  onProjectClick,
}) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const requestRef = useRef(0);
  const desktop = isElectronDesktop();

  const refreshProjects = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current;
    try {
      const result = await ipcBridge.creativeStudio.listProjects.invoke();
      if (requestRef.current === request && result.ok) setProjects(result.data);
    } catch {
      // The main library owns the visible storage error; keep the sidebar compact.
    }
  }, []);

  useEffect(() => {
    if (!desktop || collapsed) return;
    void refreshProjects();
    const unsubscribe = ipcBridge.creativeStudio.projectUpdated.on(() => {
      void refreshProjects();
    });
    return () => {
      requestRef.current += 1;
      unsubscribe();
    };
  }, [collapsed, desktop, refreshProjects]);

  if (!desktop) return null;

  const label = t('conversation.creativeStudio.nav.title');
  const recentProjects = projects.slice(0, 3);

  return (
    <div className='w-full'>
      <Tooltip {...siderTooltipProps} content={label} position='right'>
        <Button
          aria-current={isActive ? 'page' : undefined}
          aria-label={collapsed ? label : undefined}
          className={classNames(
            'box-border group h-34px w-full flex items-center text-t-primary transition-all',
            studioType.bodyTextAction,
            collapsed ? 'justify-center rd-8px' : 'justify-start gap-8px px-10px rd-0.5rem',
            isMobile && !collapsed && 'sider-action-btn-mobile',
            isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          icon={
            <MovieBoard
              theme='outline'
              size={collapsed ? '20' : '16'}
              fill='currentColor'
              className='block leading-none shrink-0'
            />
          }
          type='text'
          onClick={onClick}
        >
          {!collapsed && <span className={classNames('collapsed-hidden leading-24px', studioType.body)}>{label}</span>}
        </Button>
      </Tooltip>
      {!collapsed && (
        <div aria-label={t('conversation.creativeStudio.library.sidebar.recents')} className='px-10px pb-6px'>
          <div className='flex flex-col gap-1px pl-24px'>
            {recentProjects.map((project) => (
              <Button
                key={project.id}
                type='text'
                className={classNames(
                  'h-26px w-full justify-start overflow-hidden px-4px',
                  studioType.cardTitle,
                  studioType.bodyTextAction
                )}
                onClick={() => onProjectClick(project)}
              >
                <span className='block min-w-0 truncate'>{project.name}</span>
              </Button>
            ))}
            <Button
              type='text'
              className={classNames(
                'h-26px w-full justify-start px-4px',
                studioType.eyebrow,
                studioType.accentTextAction
              )}
              onClick={onClick}
            >
              {t('conversation.creativeStudio.library.sidebar.all')} ·{' '}
              {t('conversation.creativeStudio.library.projectCount', { count: projects.length })}
            </Button>
          </div>
          <div className='mt-6px border-t border-border-2 pt-6px pl-24px'>
            <p className={classNames('m-0 text-t-secondary', studioType.eyebrow)}>
              {t('conversation.creativeStudio.library.sidebar.noCreditsTitle')}
            </p>
            <p className={classNames('m-0 mt-2px leading-14px', studioType.body)}>
              {t('conversation.creativeStudio.library.sidebar.noCreditsBody')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiderStudioEntry;
