/** Thin React lifecycle binding; the SDK owns choice rendering, keyboard input and dismissal. */
import { Component, createRef, type ReactNode } from "react";
import { SelectControl } from "flowsvg/browser";

const CHOICES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

/** Reflect the host's committed theme and release the menu on unmount. */
export class ThemeSelect extends Component<{ value: string; onChange(value: string): void }> {
  private readonly host = createRef<HTMLDivElement>();
  private control: SelectControl | undefined;

  override componentDidMount(): void {
    if (!this.host.current) return;
    this.control = new SelectControl(this.host.current.ownerDocument, "Theme", (value) => this.props.onChange(value));
    this.host.current.append(this.control.element);
    this.componentDidUpdate();
  }

  override componentDidUpdate(): void { this.control?.render(CHOICES, this.props.value); }
  override componentWillUnmount(): void { this.control?.destroy(); }
  override render(): ReactNode { return <div id="theme" ref={this.host} />; }
}
