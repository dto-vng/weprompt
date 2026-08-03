/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Spin } from '@arco-design/web-react';
import { IconFile, IconFolder, IconUp } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBaseUrl, withLocalTokenHeaders } from '@/common/adapter/httpBridge';
import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';
import AionModal from '@/renderer/components/base/AionModal';
import { ROW_FOCUS_RING, activateOnEnterOrSpace } from '@/renderer/utils/ui/rowActivation';

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
}

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({
  visible,
  isFileMode = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (dirPath = '') => {
      setLoading(true);
      setError(null);
      try {
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(
          `${getBaseUrl()}/api/fs/browse?path=${encodeURIComponent(dirPath)}&showFiles=${showFiles}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: withLocalTokenHeaders(),
          }
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}`);
          return;
        }
        const envelope = await response.json();
        // Backend wraps the payload in { success, data, ... }.
        const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
        if (!data || !Array.isArray(data.items)) {
          setError('Invalid response from server');
          return;
        }
        // Older backends return Windows verbatim paths (`\\?\C:\DEV`), which
        // break agent spawning when stored as a workspace (issue #3191).
        // 旧版后端会返回 `\\?\` 前缀的 Windows 路径，存为工作区后会导致 agent 启动失败。
        const normalized: DirectoryData = {
          ...data,
          items: (data.items as DirectoryItem[]).map((item) => ({
            ...item,
            path: stripWindowsVerbatimPrefix(item.path),
          })),
          parentPath:
            typeof data.parentPath === 'string' ? stripWindowsVerbatimPrefix(data.parentPath) : data.parentPath,
        };
        setDirectoryData(normalized);
        setCurrentPath(dirPath);
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [isFileMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      loadDirectory('').catch((error) => console.error('Failed to load initial directory:', error));
    }
  }, [visible, loadDirectory]);

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  // Double-click behavior removed - single click now handles directory navigation
  // 移除双击行为 - 单击现在处理目录导航
  const handleItemDoubleClick = (_item: DirectoryItem) => {
    // No-op: single click already handles navigation
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      // Handle '__ROOT__' as empty path to show drive list on Windows
      // 处理 '__ROOT__' 为空路径，在 Windows 上显示驱动器列表
      const targetPath = directoryData.parentPath === '__ROOT__' ? '' : directoryData.parentPath;
      loadDirectory(targetPath).catch((error) => console.error('Failed to load parent directory:', error));
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => {
    return isFileMode ? item.isFile : item.isDirectory;
  };

  return (
    // This picker is opened *from* other modals (team/cron create dialogs sit at
    // zIndex 10000, the cron workspace menu at 10020), so it must float above all
    // of them — it's the topmost layer while choosing a folder.
    <AionModal
      variant='standard'
      visible={visible}
      header={{
        // 图标用组件渲染，不要把 emoji 拼进翻译外面：拼接会让译者无法移动或去掉字形，
        // 在 fa-IR 这种 RTL 语言里位置还会跑到错的一侧。
        // Render the glyph as a component instead of concatenating an emoji outside the
        // translation: concatenation leaves translators unable to move or drop it, and it lands
        // on the wrong side in an RTL locale such as fa-IR.
        title: (
          <span className='inline-flex items-center gap-8px'>
            {isFileMode ? <IconFile className='text-primary' /> : <IconFolder className='text-warning' />}
            <span>{isFileMode ? t('fileSelection.selectFile') : t('fileSelection.selectDirectory')}</span>
          </span>
        ),
        showClose: true,
      }}
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 10050 }}
      maskStyle={{ zIndex: 10040 }}
      footer={{
        render: () => (
          <div className='w-full flex justify-between items-center'>
            <div
              className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]'
              title={selectedPath || currentPath}
            >
              {selectedPath ||
                currentPath ||
                (isFileMode ? t('fileSelection.pleaseSelectFile') : t('fileSelection.pleaseSelectDirectory'))}
            </div>
            <div className='flex gap-10px'>
              <Button onClick={onCancel} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
                {t('common.cancel')}
              </Button>
              <Button
                type='primary'
                onClick={handleConfirm}
                disabled={!selectedPath}
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        ),
      }}
    >
      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-4 rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && (
              <div
                className={`flex items-center p-10px border-b border-b-4 cursor-pointer hover:bg-hover transition ${ROW_FOCUS_RING}`}
                role='button'
                tabIndex={0}
                aria-label={t('fileSelection.goToParent')}
                onClick={handleGoUp}
                onKeyDown={activateOnEnterOrSpace(handleGoUp)}
              >
                <IconUp className='mr-10px text-t-secondary' />
                <span>..</span>
              </div>
            )}
            {error && (
              <div className='p-16px text-center text-danger text-13px'>
                <div>{error}</div>
                <Button size='mini' className='mt-8px' onClick={() => loadDirectory(currentPath).catch(() => {})}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
            {!loading && !error && directoryData.items.length === 0 && (
              // 空目录以前是一片 400px 的空白，什么都不解释。
              // 注意 go-up 行在空目录时仍然渲染，否则键盘用户进了空目录就出不来了。
              // An empty directory used to paint a blank 400px box with no explanation. The
              // go-up row above stays rendered, or a keyboard user who walks into an empty
              // folder has no way back out.
              <div className='py-32px'>
                <Empty description={t('fileSelection.emptyFolder')} />
              </div>
            )}
            {directoryData.items.map((item, index) => {
              // 只有目录行点击/回车才有动作（进入该目录）；文件行点了不会发生任何事，
              // 所以不给它 role='button' —— 让读屏念出「按钮」再按下去毫无反应更糟。
              // 文件仍然可以用行内那颗 Select 按钮选中，它本身就能 Tab 到。
              // Only directory rows do something on click/Enter (navigate into them). A file row
              // does nothing, so it does not claim role='button' — announcing "button" and then
              // doing nothing on Enter is worse than not being focusable. Files stay selectable
              // via the row's own Select button, which is already Tab-reachable.
              const isNavigable = item.isDirectory;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-10px border-b border-b-4 hover:bg-hover transition ${isNavigable ? `cursor-pointer ${ROW_FOCUS_RING}` : ''}`}
                  style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}}
                  role={isNavigable ? 'button' : undefined}
                  tabIndex={isNavigable ? 0 : undefined}
                  onClick={() => handleItemClick(item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onKeyDown={isNavigable ? activateOnEnterOrSpace(() => handleItemClick(item)) : undefined}
                >
                  <div className='flex items-center flex-1 min-w-0'>
                    {item.isDirectory ? (
                      <IconFolder className='mr-10px text-warning shrink-0' />
                    ) : (
                      <IconFile className='mr-10px text-primary shrink-0' />
                    )}
                    <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                  </div>
                  {canSelect(item) && (
                    <Button
                      type='primary'
                      size='mini'
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(item.path);
                      }}
                    >
                      {t('common.select')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Spin>
    </AionModal>
  );
};

export default DirectorySelectionModal;
