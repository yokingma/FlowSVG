/** Isolate adapter render/effect failures so the showcase navigation remains available. */
import { Component, type ReactNode } from "react";

interface BoundaryProps {
  children: ReactNode;
  onError(error: unknown): void;
}

/** A presentation-version key resets this boundary and its adapter after a failed mount. */
export class PlayerBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
