import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import { Image, Message } from '@arco-design/web-react';
import { Download, LoadingTwo } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createContext } from '@renderer/utils/ui/createContext';
import { downloadFileFromPath } from '@renderer/utils/file/download';
import { iconColors } from '@/renderer/styles/colors';

const [useLocalImage, LocalImageProvider, useUpdateLocalImage] = createContext({ root: '' });

const getImageFileName = (path: string): string => path.split(/[/\\]/).pop() || 'image.png';

const LocalImageView: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> & {
  Provider: typeof LocalImageProvider;
  useUpdateLocalImage: typeof useUpdateLocalImage;
} = ({ src, alt, className }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(src);
  const [previewVisible, setPreviewVisible] = useState(false);
  const { root } = useLocalImage();
  const [messageApi, messageContext] = Message.useMessage();

  const absolutePath = useMemo(() => {
    if (!root) return src;
    if (
      src.startsWith('http') ||
      src.startsWith('data:') ||
      src.startsWith('/') ||
      src.startsWith('file:') ||
      src.startsWith('\\') ||
      /^[A-Za-z]:/.test(src)
    ) {
      return src;
    }
    return joinPath(root, src);
  }, [src, root]);

  useEffect(() => {
    setLoading(true);
    ipcBridge.fs.getImageBase64
      .invoke({ path: absolutePath, workspace: root || undefined })
      .then((base64) => {
        if (base64) {
          setUrl(base64);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error('[LocalImageView] Failed to load image:', {
          path: absolutePath,
          error,
        });
        setLoading(false);
      });
  }, [absolutePath]);

  // Download the original file (full resolution), not the (possibly downscaled) view.
  const handleDownload = useCallback(async () => {
    try {
      await downloadFileFromPath(absolutePath, getImageFileName(absolutePath), root || undefined);
      messageApi.success(t('acp.image.download_success', { defaultValue: 'Download successful' }));
    } catch (error) {
      console.error('[LocalImageView] Failed to download image:', error);
      messageApi.error(t('acp.image.download_error', { defaultValue: 'Failed to download' }));
    }
  }, [absolutePath, root, messageApi, t]);

  if (loading)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <LoadingTwo
          className='loading'
          style={{ display: 'flex' }}
          theme='outline'
          size='14'
          fill={iconColors.primary}
          strokeWidth={2}
        />
        <span>{alt}</span>
      </span>
    );
  return (
    <>
      {messageContext}
      {/* Bounded inline thumbnail; click opens a full-resolution zoomable preview. */}
      <img
        src={url}
        alt={alt}
        className={className}
        style={{ cursor: 'zoom-in' }}
        onClick={() => setPreviewVisible(true)}
      />
      <Image.Preview
        src={url}
        visible={previewVisible}
        onVisibleChange={setPreviewVisible}
        actions={[
          {
            key: 'download',
            name: t('acp.image.download', { defaultValue: 'Download' }),
            content: <Download theme='outline' size='16' />,
            onClick: () => void handleDownload(),
          },
        ]}
      />
    </>
  );
};

LocalImageView.Provider = LocalImageProvider;
LocalImageView.useUpdateLocalImage = useUpdateLocalImage;

export default LocalImageView;
