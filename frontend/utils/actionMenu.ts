import type { CSSProperties } from 'react';

/**
 * Computes a `position: fixed` style for an action dropdown anchored to the
 * trigger button's bounding rect.
 *
 * Why fixed? Action menus inside table cells were previously `position:
 * absolute` and ended up hidden/overlapped because ancestor containers
 * (`.pp-panel { overflow: hidden }`, `.clients-table-wrap { overflow: auto }`,
 * etc.) clip or stack over descendants that extend past their bounds. A
 * fixed-position menu anchored to the button rect escapes every clipping
 * container and is clamped to the viewport.
 *
 * The menu flips above the trigger when there isn't enough room below, and
 * hugs the right edge so it never overflows the right side of the screen.
 */
export function getFloatingMenuStyle(
    anchor: DOMRect | null | undefined,
    opts: { minWidth?: number; estimatedHeight?: number; gap?: number } = {}
): CSSProperties {
    const { minWidth = 224, estimatedHeight = 360, gap = 6 } = opts;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

    const anchorRight = anchor?.right ?? vw - 16;
    const anchorTop = anchor?.top ?? 12;
    const anchorBottom = anchor?.bottom ?? 12;

    const right = Math.max(8, vw - anchorRight);
    const spaceBelow = vh - anchorBottom - 8;
    const top = spaceBelow > estimatedHeight
        ? anchorBottom + gap
        : Math.max(8, anchorTop - estimatedHeight - gap);

    return {
        position: 'fixed',
        top,
        right,
        minWidth,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        zIndex: 9999,
    } as CSSProperties;
}
