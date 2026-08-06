import React from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { MovieBoard } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { CREATIVE_STUDIO_ENABLED } from '@/common/config/constants';
import studioType from '@renderer/pages/studio/StudioTypography.module.css';
import { isElectronDesktop } from '@renderer/utils/platform';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderStudioEntryProps = {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
};

const SiderStudioEntry: React.FC<SiderStudioEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();
  const desktop = isElectronDesktop();

  if (!CREATIVE_STUDIO_ENABLED || !desktop) return null;

  const label = t('conversation.creativeStudio.nav.title');

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
    </div>
  );
};

export default SiderStudioEntry;
