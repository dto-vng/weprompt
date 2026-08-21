import { useRef, useState } from 'react';

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);
  const [isComposingState, setIsComposingState] = useState(false);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
      setIsComposingState(true);
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
      setIsComposingState(false);
    },
  };

  /**
   * Arco's Input/TextArea withholds `onChange` for the whole of an IME
   * composition: `useComposition.valueChangeHandler` sees its own
   * `refIsComposition` flag and updates only Arco's internal display value. A
   * controlled parent's state therefore stays behind the text already on
   * screen, and anything derived from it — most visibly a send button's
   * enabled flag — is wrong until the composition commits. Reported by a user
   * typing Vietnamese, where Telex commits on space, so the button only woke
   * up at the first space.
   *
   * The native `input` event does fire during composition (`isComposing: true`,
   * with the composed value already on `target`), and Arco spreads unknown
   * props onto the real textarea, so `onInput` reaches it. Mirroring the value
   * from there keeps the parent in step without touching Arco's commit path:
   * Arco renders `compositionValue || value`, so writing back the identical
   * composing text cannot disturb the IME.
   */
  const createCompositionValueSync = (onValueChange: (value: string) => void) => {
    return (e: React.FormEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      // Outside a composition Arco's own onChange has already reported this value.
      if (!isComposing.current) return;
      onValueChange(e.currentTarget.value);
    };
  };

  const createKeyDownHandler = (onEnterPress: () => void, onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (onKeyDownIntercept?.(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    createCompositionValueSync,
    createKeyDownHandler,
  };
};
