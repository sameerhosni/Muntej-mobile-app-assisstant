// Keeps an overlay's crash to itself: if a floating card (Saree3's coach, launch card…) throws while rendering, it
// just disappears instead of blanking the whole app (overlays sit outside the router's own error screens).
import { Component, type ReactNode } from 'react';

export class QuietBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[${this.props.name}] hidden after an error`, String(error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
