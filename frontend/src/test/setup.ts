import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks a few browser APIs that Radix (popover / dialog) and the app rely on.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? RO;
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.className = '';
});
