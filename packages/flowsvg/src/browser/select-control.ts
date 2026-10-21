/** Shared select-only combobox for playback and host settings; the caller owns the committed value. */
/** One non-editable choice. Values must be unique within a control. */
export interface SelectChoice {
  value: string;
  label: string;
}

let nextId = 0;

/**
 * Styled choices keep focus on the trigger. Arrow keys preview; Enter/Space commit; Escape/Tab cancel.
 * Append element before use, synchronize with render(), and call destroy() before removing the host.
 */
export class SelectControl {
  readonly element: HTMLDivElement;
  private readonly trigger: HTMLButtonElement;
  private readonly list: HTMLDivElement;
  private choices: readonly SelectChoice[] = [];
  private activeIndex = 0;
  private destroyed = false;

  constructor(owner: Document, label: string, private readonly onChange: (value: string) => void) {
    this.element = owner.createElement("div");
    this.element.className = "flowsvg-select";
    this.trigger = owner.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "flowsvg-select-trigger";
    this.trigger.setAttribute("role", "combobox");
    this.trigger.setAttribute("aria-label", label);
    this.trigger.setAttribute("aria-haspopup", "listbox");
    this.trigger.setAttribute("aria-expanded", "false");
    this.list = owner.createElement("div");
    this.list.id = `flowsvg-choices-${++nextId}`;
    this.list.className = "flowsvg-select-options";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", label);
    this.list.hidden = true;
    this.trigger.setAttribute("aria-controls", this.list.id);
    this.trigger.addEventListener("click", this.toggle);
    this.trigger.addEventListener("keydown", this.onKey);
    this.element.addEventListener("focusout", this.onBlur);
    this.element.append(this.trigger, this.list);
  }

  /** Replace changed choices and reflect external state without committing a user action. */
  render(choices: readonly SelectChoice[], value: string, disabled = false): void {
    if (this.destroyed) return;
    const changed = choices.length !== this.choices.length || choices.some((choice, index) =>
      choice.value !== this.choices[index]?.value || choice.label !== this.choices[index]?.label);
    if (changed) {
      this.close();
      this.choices = choices;
      this.list.replaceChildren(...choices.map((choice, index) => this.createOption(choice, index)));
    }
    this.trigger.value = value;
    this.trigger.dataset.value = value;
    this.trigger.textContent = choices.find((choice) => choice.value === value)?.label ?? "—";
    this.trigger.disabled = disabled || choices.length === 0;
    for (const option of Array.from(this.list.children)) {
      option.setAttribute("aria-selected", String(option.getAttribute("data-value") === value));
    }
    if (this.trigger.disabled) this.close();
  }

  /** Release outside-dismissal listeners and make detached controls inert. Idempotent. */
  destroy(): void {
    this.close();
    this.destroyed = true;
    this.trigger.removeEventListener("click", this.toggle);
    this.trigger.removeEventListener("keydown", this.onKey);
    this.element.removeEventListener("focusout", this.onBlur);
    this.element.remove();
  }

  private createOption(choice: SelectChoice, index: number): HTMLDivElement {
    const option = this.element.ownerDocument.createElement("div");
    option.id = `${this.list.id}-${index}`;
    option.setAttribute("role", "option");
    option.dataset.value = choice.value;
    option.textContent = choice.label;
    // Pointer selection must retain trigger focus, including when the host synchronously replaces a player.
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => this.commit(index));
    return option;
  }

  private readonly toggle = (): void => {
    if (this.list.hidden) this.open();
    else this.close();
  };

  private open(): void {
    if (this.destroyed || this.trigger.disabled || !this.list.hidden) return;
    this.list.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.highlight(Math.max(0, this.choices.findIndex((choice) => choice.value === this.trigger.value)));
    this.element.ownerDocument.addEventListener("pointerdown", this.onOutside);
  }

  private close(): void {
    this.list.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.removeAttribute("aria-activedescendant");
    this.element.ownerDocument.removeEventListener("pointerdown", this.onOutside);
  }

  private highlight(index: number): void {
    this.activeIndex = Math.max(0, Math.min(this.choices.length - 1, index));
    Array.from(this.list.children).forEach((option, optionIndex) => {
      option.toggleAttribute("data-active", optionIndex === this.activeIndex);
    });
    const active = this.list.children[this.activeIndex];
    if (active) {
      this.trigger.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private commit(index: number): void {
    if (this.destroyed || this.trigger.disabled || this.list.hidden) return;
    const choice = this.choices[index];
    this.close();
    if (choice && choice.value !== this.trigger.value) this.onChange(choice.value);
  }

  private readonly onOutside = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this.element)) this.close();
  };

  private readonly onBlur = (event: FocusEvent): void => {
    const target = event.relatedTarget;
    if (!(target instanceof this.element.ownerDocument.defaultView!.Node) || !this.element.contains(target)) this.close();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || this.trigger.disabled) return;
    if (event.key === "Tab") { this.close(); return; }
    if (event.key === "Escape") {
      if (!this.list.hidden) { event.preventDefault(); event.stopPropagation(); this.close(); }
      return;
    }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (this.list.hidden) this.open();
      else this.commit(this.activeIndex);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const wasOpen = !this.list.hidden;
      this.open();
      if (event.key === "Home") this.highlight(0);
      else if (event.key === "End") this.highlight(this.choices.length - 1);
      else if (wasOpen) this.highlight(this.activeIndex + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key.length === 1 && event.key.trim()) {
      const start = this.list.hidden ? -1 : this.activeIndex;
      this.open();
      const indexes = this.choices.map((_, index) => (start + index + 1) % this.choices.length);
      const match = indexes.find((index) => this.choices[index].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match !== undefined) { event.preventDefault(); this.highlight(match); }
    }
  };
}
