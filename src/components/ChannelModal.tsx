/**
 * ChannelModal — create or edit a channel with full settings.
 *
 * Handles: name, password (hashed), AFK, queued, max users.
 * Used for both "New Channel" and "Edit Channel" flows.
 */
import { Component, createSignal, Show } from "solid-js";
import { IconX, IconLock, IconMoon, IconQueue } from "./icons";

export interface ChannelFormData {
  name: string;
  password: string;       // raw, will be hashed before storage
  isAfk: boolean;
  isQueued: boolean;
  maxUsers: number | null;
}

interface Props {
  mode: "create" | "edit";
  initial?: Partial<ChannelFormData> & { name?: string };
  parentName?: string;
  onConfirm: (data: ChannelFormData) => void;
  onCancel: () => void;
}

const ChannelModal: Component<Props> = (props) => {
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [password, setPassword] = createSignal("");
  const [showPwField, setShowPwField] = createSignal(false);
  const [isAfk, setIsAfk] = createSignal(props.initial?.isAfk ?? false);
  const [isQueued, setIsQueued] = createSignal(props.initial?.isQueued ?? false);
  const [maxUsers, setMaxUsers] = createSignal<number | null>(props.initial?.maxUsers ?? null);
  const [error, setError] = createSignal("");

  const handleConfirm = () => {
    const n = name().trim();
    if (!n) { setError("Channel name required."); return; }
    if (n.length > 32) { setError("Max 32 characters."); return; }
    setError("");

    props.onConfirm({
      name: n,
      password: password().trim(),
      isAfk: isAfk(),
      isQueued: isQueued(),
      maxUsers: maxUsers(),
    });
  };

  return (
    <div
      class="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}
    >
      <div class="modal-box" style={{ "max-width": "300px" }}>
        <div class="modal-title">
          {props.mode === "create" ? "New Channel" : "Edit Channel"}
          <Show when={props.parentName}>
            <span class="text-dim" style={{ "font-size": "var(--fs-xs)", "margin-left": "6px" }}>
              in {props.parentName}
            </span>
          </Show>
        </div>

        {/* Name */}
        <div class="setting-row" style={{ gap: "4px" }}>
          <label>Name</label>
          <input
            class="pixel-input"
            type="text"
            placeholder="channel name..."
            value={name()}
            maxLength={32}
            onInput={(e) => { setName(e.currentTarget.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autofocus
            autocomplete="off"
            spellcheck={false}
          />
        </div>

        {/* Options row */}
        <div class="row gap-2" style={{ "flex-wrap": "wrap" }}>
          {/* AFK toggle */}
          <label class="row gap-1" style={{ cursor: "pointer", "align-items": "center" }}>
            <input
              type="checkbox"
              checked={isAfk()}
              onChange={(e) => setIsAfk(e.currentTarget.checked)}
            />
            <IconMoon size={11} />
            <span style={{ "font-size": "var(--fs-sm)" }}>AFK</span>
          </label>

          {/* Queued toggle */}
          <label class="row gap-1" style={{ cursor: "pointer", "align-items": "center" }}>
            <input
              type="checkbox"
              checked={isQueued()}
              onChange={(e) => setIsQueued(e.currentTarget.checked)}
            />
            <IconQueue size={11} />
            <span style={{ "font-size": "var(--fs-sm)" }}>Queued</span>
          </label>

          {/* Password toggle */}
          <label class="row gap-1" style={{ cursor: "pointer", "align-items": "center" }}>
            <input
              type="checkbox"
              checked={showPwField()}
              onChange={(e) => {
                setShowPwField(e.currentTarget.checked);
                if (!e.currentTarget.checked) setPassword("");
              }}
            />
            <IconLock size={11} />
            <span style={{ "font-size": "var(--fs-sm)" }}>Password</span>
          </label>
        </div>

        {/* Password field */}
        <Show when={showPwField()}>
          <div class="setting-row" style={{ gap: "4px" }}>
            <label>Password</label>
            <input
              class="pixel-input"
              type="password"
              placeholder="channel password..."
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="new-password"
            />
            <span class="setting-row-hint">Members entering this channel must know the password.</span>
          </div>
        </Show>

        {/* Max users */}
        <div class="setting-row" style={{ gap: "4px" }}>
          <label>Max Users (optional)</label>
          <input
            class="pixel-input"
            type="number"
            min={1}
            max={14}
            placeholder="no limit"
            value={maxUsers() ?? ""}
            onInput={(e) => {
              const v = parseInt(e.currentTarget.value);
              setMaxUsers(isNaN(v) ? null : Math.min(14, Math.max(1, v)));
            }}
          />
        </div>

        {/* Error */}
        <Show when={error()}>
          <div class="text-muted" style={{ "font-size": "var(--fs-sm)" }}>{error()}</div>
        </Show>

        {/* Actions */}
        <div class="row gap-1">
          <button
            class="pixel-btn is-active"
            style={{ flex: "1", "font-size": "var(--fs)" }}
            onClick={handleConfirm}
          >
            {props.mode === "create" ? "Create" : "Save"}
          </button>
          <button
            class="pixel-btn pixel-btn-icon"
            onClick={props.onCancel}
          >
            <IconX size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelModal;
