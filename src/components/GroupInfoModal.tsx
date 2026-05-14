import { Component, Show, createSignal } from "solid-js";
import { IconX, IconWarning, IconHash, IconWifi, IconTrash } from "./icons";

interface Props {
  groupName: string;
  groupKey: string;
  peerCount: number;
  channelCount: number;
  onRename: (name: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}

const GroupInfoModal: Component<Props> = (props) => {
  const [name, setName] = createSignal(props.groupName);
  const [copied, setCopied] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [error, setError] = createSignal("");

  const copyKey = async () => {
    await navigator.clipboard.writeText(props.groupKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    const n = name().trim();
    if (!n) { setError("Group name required."); return; }
    if (n.length > 40) { setError("Max 40 characters."); return; }
    setError("");
    await props.onRename(n);
  };

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal-box" style={{ "max-width": "340px" }}>
        <div class="modal-title row gap-1" style={{ "justify-content": "space-between" }}>
          <span>Group Info</span>
          <button class="pixel-btn pixel-btn-icon" onClick={props.onClose}>
            <IconX size={14} />
          </button>
        </div>

        <div class="setting-row" style={{ gap: "4px" }}>
          <label>Group Name</label>
          <input
            class="pixel-input"
            type="text"
            value={name()}
            maxLength={40}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div class="setting-row" style={{ gap: "4px" }}>
          <label>Group Key</label>
          <div
            onClick={copyKey}
            style={{
              background: "var(--c-panel)",
              border: "2px solid var(--c-border)",
              padding: "8px 10px",
              "font-family": "\"Press Start 2P\", monospace",
              "font-size": "var(--fs-xs)",
              color: copied() ? "var(--c-speaking)" : "var(--c-accent)",
              "letter-spacing": "1px",
              "word-break": "break-all",
              cursor: "pointer",
              transition: "color 200ms linear",
            }}
          >
            {copied() ? "copied!" : props.groupKey}
          </div>
          <div class="setting-row-hint">Click to copy. Share this key to invite people.</div>
        </div>

        <div class="row gap-2" style={{ "font-size": "var(--fs-sm)", color: "var(--c-text-mid)" }}>
          <span class="row gap-1"><IconWifi size={12} /> {props.peerCount} peer{props.peerCount !== 1 ? "s" : ""}</span>
          <span class="row gap-1"><IconHash size={12} /> {props.channelCount} channel{props.channelCount !== 1 ? "s" : ""}</span>
        </div>

        <Show when={error()}>
          <div class="connect-form-error row gap-1">
            <IconWarning size={10} />
            {error()}
          </div>
        </Show>

        <div class="row gap-1">
          <button class="pixel-btn is-active" style={{ flex: 1 }} onClick={save}>Save</button>
          <Show
            when={!confirmDelete()}
            fallback={
              <button class="pixel-btn danger" onClick={() => props.onDelete()}>
                Confirm Delete
              </button>
            }
          >
            <button class="pixel-btn" onClick={() => setConfirmDelete(true)}>
              <IconTrash size={12} />
              Delete
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default GroupInfoModal;
