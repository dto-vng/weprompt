import React from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Tooltip } from '@arco-design/web-react';
import type { IMcpServer } from '@/common/config/storage';

interface McpServerToolsListProps {
  server: IMcpServer;
}

const McpServerToolsList: React.FC<McpServerToolsListProps> = ({ server }) => {
  const { t } = useTranslation();

  if (!server.tools || server.tools.length === 0) {
    // 不能 return null：父级 Collapse.Item 的内容区有强制内边距，返回 null 只会留下一块
    // 空白的空隙，让「这个服务器确实没有工具」和「工具列表加载失败/还没拉」看起来一模一样。
    // Returning null is not an option: the parent Collapse.Item's content box is force-padded,
    // so null still leaves a visible empty gap — which makes a server that genuinely exposes no
    // tools indistinguishable from one whose tool list failed to load or was never fetched.
    return <Empty description={t('settings.mcpNoTools')} />;
  }

  return (
    <div className='space-y-3'>
      <div>
        <div className='space-y-2'>
          {server.tools.map((tool, index) => (
            <div key={index} className='rounded-lg border border-2 bg-2 px-4 py-3'>
              <div className='flex gap-4'>
                <div className='flex-shrink-0 min-w-0 w-1/3'>
                  <div className='break-words text-sm font-semibold text-t-primary'>{tool.name}</div>
                </div>
                <div className='flex-1 min-w-0'>
                  <Tooltip content={tool.description || t('settings.mcpNoDescription')}>
                    <div className='line-clamp-1 cursor-pointer text-xs leading-5 text-t-secondary'>
                      {tool.description || t('settings.mcpNoDescription')}
                    </div>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default McpServerToolsList;
