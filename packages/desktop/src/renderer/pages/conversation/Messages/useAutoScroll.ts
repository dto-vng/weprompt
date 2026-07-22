/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAutoScroll - Scroll manager for the message list.
 *
 * Strategy:
 * - On a new user message, anchor that message near the top of the viewport and
 *   reserve ~one viewport of space below it, so the streamed reply fills that
 *   space without the viewport constantly scrolling. The reserved space shrinks
 *   as the reply grows; the scroll-to-bottom button surfaces when real content
 *   sits below the fold so the user can scroll down when they choose.
 * - Outside an anchored turn (initial load, etc.) keep the list pinned to the
 *   bottom while the user is already at the bottom.
 * - The reserved spacer is excluded from all "distance to bottom" math so the
 *   button and pin logic track the end of real content, not the empty spacer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TMessage } from '@/common/chat/chatLib';
import { computeReservedSpace } from './scrollReserve';

const PROGRAMMATIC_SCROLL_GUARD_MS = 150;
const AT_BOTTOM_THRESHOLD_PX = 100;
const FOLLOW_BOTTOM_THRESHOLD_PX = 4;
const RESERVE_EPSILON_PX = 2;
// On a new turn, scroll the user's message to this fraction from the top of the
// viewport (not all the way up) so the tail of the previous turn stays visible.
const ANCHOR_TOP_GAP_FRACTION = 0.25;

interface UseAutoScrollOptions {
  messages: TMessage[];
  itemCount: number;
  isStreaming: boolean;
}

interface ScrollElementIntoViewOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

interface UseAutoScrollReturn {
  handleScrollerRef: (ref: HTMLDivElement | null) => void;
  handleContentRef: (ref: HTMLDivElement | null) => void;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handlePointerDown: () => void;
  showScrollButton: boolean;
  reservedSpaceHeight: number;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollElementIntoView: (element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => void;
  hideScrollButton: () => void;
}

export function useAutoScroll({ messages, itemCount, isStreaming }: UseAutoScrollOptions): UseAutoScrollReturn {
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [reservedSpaceHeight, setReservedSpaceHeight] = useState(0);

  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);
  const lastProgrammaticScrollTimeRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const pendingAutoFollowFrameRef = useRef<number | null>(null);
  const userInputActiveRef = useRef(false);
  const anchorIdRef = useRef<string | null>(null);
  const reservedRef = useRef(0);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // Distance from the current scroll position to the end of *real* content. The
  // reserved bottom spacer is subtracted so button/pin logic ignore empty space.
  const bottomGapOf = useCallback((element: HTMLElement): number => {
    return element.scrollHeight - reservedRef.current - element.clientHeight - element.scrollTop;
  }, []);

  const markProgrammaticScroll = useCallback(() => {
    lastProgrammaticScrollTimeRef.current = Date.now();
  }, []);

  const updateBottomState = useCallback(
    (element: HTMLDivElement) => {
      const bottomGap = bottomGapOf(element);
      const withinButtonThreshold = bottomGap <= AT_BOTTOM_THRESHOLD_PX;
      const pinnedToBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;
      setShowScrollButton(!withinButtonThreshold);

      if (pinnedToBottom) {
        userScrolledRef.current = false;
        userInputActiveRef.current = false;
        lastProgrammaticScrollTimeRef.current = Date.now() - (PROGRAMMATIC_SCROLL_GUARD_MS - 50);
      }

      return pinnedToBottom;
    },
    [bottomGapOf]
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (itemCount <= 0 || !scrollerEl) return;

      markProgrammaticScroll();
      scrollerEl.scrollTo({
        top: scrollerEl.scrollHeight - reservedRef.current - scrollerEl.clientHeight,
        behavior,
      });
      userScrolledRef.current = false;
      setShowScrollButton(false);
    },
    [itemCount, markProgrammaticScroll, scrollerEl]
  );

  // Trim the reserved spacer so exactly ~one viewport sits below the anchor (the
  // latest user message). Idempotent and excludes the spacer from its own math,
  // so ResizeObserver-driven re-runs converge instead of looping.
  const recomputeReservedSpace = useCallback(() => {
    const anchorId = anchorIdRef.current;
    if (!anchorId || !scrollerEl || !contentEl) return;
    const anchorEl = scrollerEl.ownerDocument.getElementById(`message-${anchorId}`);
    if (!anchorEl) return;

    const anchorTop = anchorEl.getBoundingClientRect().top - contentEl.getBoundingClientRect().top;
    const contentBelowAnchor = contentEl.scrollHeight - reservedRef.current - anchorTop;
    const next = computeReservedSpace(scrollerEl.clientHeight * (1 - ANCHOR_TOP_GAP_FRACTION), contentBelowAnchor);
    if (Math.abs(next - reservedRef.current) > RESERVE_EPSILON_PX) {
      reservedRef.current = next;
      setReservedSpaceHeight(next);
    }
  }, [contentEl, scrollerEl]);

  const scheduleAutoFollow = useCallback(() => {
    if (!scrollerEl || userScrolledRef.current) return;

    if (pendingAutoFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingAutoFollowFrameRef.current);
    }

    pendingAutoFollowFrameRef.current = requestAnimationFrame(() => {
      pendingAutoFollowFrameRef.current = null;
      if (!scrollerEl || userScrolledRef.current) return;

      if (bottomGapOf(scrollerEl) > 2) {
        scrollToBottom('auto');
      }
    });
  }, [bottomGapOf, scrollerEl, scrollToBottom]);

  const handleScrollerRef = useCallback((ref: HTMLDivElement | null) => {
    setScrollerEl(ref);
  }, []);

  const handleContentRef = useCallback((ref: HTMLDivElement | null) => {
    setContentEl(ref);
  }, []);

  const scrollElementIntoView = useCallback(
    (element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => {
      if (!element) return;

      userScrolledRef.current = false;
      setShowScrollButton(false);
      markProgrammaticScroll();
      element.scrollIntoView({
        behavior: options?.behavior ?? 'smooth',
        block: options?.block ?? 'start',
        inline: 'nearest',
      });
    },
    [markProgrammaticScroll]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const currentScrollTop = target.scrollTop;
      const timeSinceGuard = Date.now() - lastProgrammaticScrollTimeRef.current;
      const delta = currentScrollTop - lastScrollTopRef.current;
      const pinnedToBottom = bottomGapOf(target) <= FOLLOW_BOTTOM_THRESHOLD_PX;

      if (
        !pinnedToBottom &&
        Math.abs(delta) > 2 &&
        (userInputActiveRef.current || timeSinceGuard >= PROGRAMMATIC_SCROLL_GUARD_MS)
      ) {
        userScrolledRef.current = true;
      }

      if (pinnedToBottom) {
        userInputActiveRef.current = false;
      } else if (Math.abs(delta) > 2) {
        userInputActiveRef.current = false;
      }

      lastScrollTopRef.current = currentScrollTop;
      updateBottomState(target);
    },
    [bottomGapOf, updateBottomState]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
      userInputActiveRef.current = true;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    userInputActiveRef.current = true;
  }, []);

  useEffect(() => {
    if (!scrollerEl || !contentEl) return;

    const observer = new ResizeObserver(() => {
      // During an anchored turn hold the viewport still and only resize the
      // reserved spacer as the reply grows; otherwise keep classic pin-to-bottom.
      if (anchorIdRef.current) {
        recomputeReservedSpace();
      } else {
        scheduleAutoFollow();
      }
      updateBottomState(scrollerEl);
    });

    observer.observe(scrollerEl);
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [contentEl, recomputeReservedSpace, scheduleAutoFollow, scrollerEl, updateBottomState]);

  useEffect(() => {
    if (!scrollerEl || initialScrollDoneRef.current || itemCount === 0) return;

    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom('auto');
      lastScrollTopRef.current = scrollerEl.scrollTop;
    });
  }, [itemCount, scrollerEl, scrollToBottom]);

  // A new user message starts an anchored turn: pin it near the top and reserve a
  // viewport of space so the reply streams into view without moving the viewport.
  useEffect(() => {
    const currentListLength = messages.length;
    const previousLength = previousListLengthRef.current;
    const isNewMessage = currentListLength > previousLength;
    previousListLengthRef.current = currentListLength;

    if (!isNewMessage) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.position !== 'right' || !scrollerEl) return;

    userScrolledRef.current = false;
    anchorIdRef.current = lastMessage.id;
    const targetBelow = scrollerEl.clientHeight * (1 - ANCHOR_TOP_GAP_FRACTION);
    reservedRef.current = targetBelow;
    setReservedSpaceHeight(targetBelow);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const anchorEl = scrollerEl.ownerDocument.getElementById(`message-${lastMessage.id}`);
        if (anchorEl) {
          markProgrammaticScroll();
          // Ease the user's message up to ~a quarter from the top (not all the way),
          // so the previous turn stays partly visible and the reply fills the space below.
          const anchorOffsetTop =
            anchorEl.getBoundingClientRect().top - scrollerEl.getBoundingClientRect().top + scrollerEl.scrollTop;
          const targetTop = Math.max(0, anchorOffsetTop - scrollerEl.clientHeight * ANCHOR_TOP_GAP_FRACTION);
          scrollerEl.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else {
          scrollToBottom('smooth');
        }
        recomputeReservedSpace();
      });
    });
  }, [markProgrammaticScroll, messages, recomputeReservedSpace, scrollToBottom, scrollerEl]);

  useEffect(() => {
    return () => {
      if (pendingAutoFollowFrameRef.current !== null) {
        cancelAnimationFrame(pendingAutoFollowFrameRef.current);
      }
    };
  }, []);

  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    showScrollButton,
    reservedSpaceHeight,
    scrollToBottom,
    scrollElementIntoView,
    hideScrollButton,
  };
}
