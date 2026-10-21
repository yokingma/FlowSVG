/** Thin Vue lifecycle binding; the SDK owns choice rendering, keyboard input and dismissal. */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { SelectControl } from "flowsvg/browser";

const CHOICES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

/** Reflect the host's committed theme and release the menu on unmount. */
export const ThemeSelect = defineComponent({
  props: { value: { type: String, required: true } },
  emits: { change: (_value: string) => true },
  setup(props, { emit }) {
    const host = ref<HTMLDivElement>();
    let control: SelectControl | undefined;
    onMounted(() => {
      if (!host.value) return;
      control = new SelectControl(host.value.ownerDocument, "Theme", (value) => emit("change", value));
      host.value.append(control.element);
      control.render(CHOICES, props.value);
    });
    watch(() => props.value, (value) => control?.render(CHOICES, value));
    onBeforeUnmount(() => control?.destroy());
    return () => h("div", { id: "theme", ref: host });
  },
});
