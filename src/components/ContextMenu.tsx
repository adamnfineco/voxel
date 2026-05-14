import { Component, For, Show, onMount, onCleanup } from "solid-js";

export interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
  icon?: () => any;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const ContextMenu: Component<Props> = (props) => {
  let ref: HTMLDivElement | undefined;

  const handleDown = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      props.onClose();
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => {
    // Defer so the triggering mousedown doesn't immediately close
    setTimeout(() => {
      document.addEventListener("mousedown", handleDown);
      document.addEventListener("keydown", handleKey);
    }, 0);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleDown);
    document.removeEventListener("keydown", handleKey);
  });

  // Keep menu inside viewport
  const clampedX = () => Math.min(props.x, window.innerWidth - 160);
  const clampedY = () => Math.min(props.y, window.innerHeight - (props.items.length * 24 + 16));

  return (
    <div
      ref={ref}
      class="ctx-menu"
      style={{
        left: `${clampedX()}px`,
        top: `${clampedY()}px`,
      }}
    >
      <For each={props.items}>
        {(item) => (
          <Show
            when={!item.separator}
            fallback={<div class="ctx-menu-sep" />}
          >
            <div
              class={`ctx-menu-item${item.danger ? " is-danger" : ""}`}
              onClick={() => {
                item.action();
                props.onClose();
              }}
            >
              {item.icon ? <span class="row">{item.icon()}</span> : null}
              {item.label}
            </div>
          </Show>
        )}
      </For>
    </div>
  );
};

export default ContextMenu;
