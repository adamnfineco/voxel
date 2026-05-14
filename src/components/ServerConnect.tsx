import { Component, createSignal, For, Show } from "solid-js";
import {
  IconPlus,
  IconTrash,
  IconArrowRight,
  IconWarning,
  IconSpinner,
  IconWifi,
} from "./icons";
import type { Server } from "../store/servers";
import { addServer, removeServer } from "../store/servers";
import { setDisplayName as saveDisplayName } from "../store/identity";
import { setDisplayName as setStateDisplayName } from "../store/appState";
import { deriveServerName } from "../runtime/config";

interface Props {
  servers: Server[];
  currentName: string;
  connectError?: string;
  onConnect: (server: Server, name: string) => Promise<void>;
  onServersChange: () => void;
}

const ServerConnect: Component<Props> = (props) => {
  const [name, setName] = createSignal(props.currentName || "");
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newKey, setNewKey] = createSignal("");
  const [error, setError] = createSignal("");
  const [addError, setAddError] = createSignal("");
  const [connecting, setConnecting] = createSignal<string | null>(null); // server id being connected

  const handleNameChange = async (val: string) => {
    setName(val);
    setStateDisplayName(val);
    await saveDisplayName(val);
  };

  const handleConnect = async (server: Server) => {
    const n = name().trim();
    if (!n) {
      setError("Enter a display name first.");
      return;
    }
    if (n.length > 24) {
      setError("Name too long — max 24 characters.");
      return;
    }
    setError("");
    setConnecting(server.id);
    try {
      await props.onConnect(server, n);
    } finally {
      setConnecting(null);
    }
  };

  const handleAddServer = async () => {
    const n = newName().trim();
    const k = newKey().trim();

    if (!k) { setAddError("Server key required."); return; }

    setAddError("");
    await addServer(n || deriveServerName(k), k);
    setShowAddForm(false);
    setNewName(""); setNewKey("");
    props.onServersChange();
  };

  const handleRemove = async (e: MouseEvent, server: Server) => {
    e.stopPropagation();
    await removeServer(server.id);
    props.onServersChange();
  };

  return (
    <div class="connect-screen">
      {/* Logo */}
      <div class="connect-logo-wrap">
        <span class="connect-logo">VOXEL</span>
        <span class="connect-tagline">voice · mesh · zero servers</span>
      </div>

      {/* Name field */}
      <div class="connect-form">
        <div>
          <label>Display Name</label>
          <input
            class="pixel-input"
            type="text"
            placeholder="your callsign..."
            value={name()}
            maxLength={24}
            onInput={(e) => handleNameChange(e.currentTarget.value)}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck={false}
          />
        </div>

        <Show when={error() || props.connectError}>
          <div class="connect-form-error row gap-1">
            <IconWarning size={10} />
            {error() || props.connectError}
          </div>
        </Show>
      </div>

      {/* Server list */}
      <div class="server-list">
        <div class="server-list-label row gap-1">
          <IconWifi size={8} />
          Servers
        </div>

        <Show
          when={props.servers.length > 0}
          fallback={
            <div class="server-empty">
              No servers saved.<br />Add one below to get started.
            </div>
          }
        >
          <For each={props.servers}>
            {(server) => (
              <div
                class="server-item"
                onClick={() => handleConnect(server)}
              >
                <div class="server-item-info">
                  <span class="server-item-name">{server.name}</span>
                  <span class="server-item-url">key: {server.server_key.slice(0, 6)}…</span>
                </div>

                <div class="row gap-1">
                  {/* Connect indicator / spinner */}
                  <Show
                    when={connecting() === server.id}
                    fallback={
                      <IconArrowRight size={11} color="var(--c-text-dim)" />
                    }
                  >
                    <IconSpinner size={11} color="var(--c-accent)" />
                  </Show>

                  {/* Remove */}
                  <button
                    class="pixel-btn pixel-btn-icon danger"
                    style={{ width: "20px", height: "20px" }}
                    onClick={(e) => handleRemove(e, server)}
                    title="Remove server"
                  >
                    <IconTrash size={9} />
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>

        {/* Add server toggle */}
        <Show
          when={!showAddForm()}
          fallback={
            <div class="add-server-form">
              <div class="setting-group-label" style={{ "margin-bottom": "4px" }}>
                Add Server
              </div>

              <div>
                <label>Name (optional)</label>
                <input
                  class="pixel-input"
                  type="text"
                  placeholder="friendly nickname"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  autocomplete="off"
                />
              </div>

              <div>
                <label>Server Key</label>
                <input
                  class="pixel-input"
                  type="text"
                  placeholder="shared key from the room"
                  value={newKey()}
                  onInput={(e) => setNewKey(e.currentTarget.value)}
                  autocomplete="off"
                  spellcheck={false}
                />
              </div>

              <div class="setting-row-hint">Routing and discovery are automatic. Audio stays peer-to-peer.</div>

              <Show when={addError()}>
                <div class="connect-form-error row gap-1">
                  <IconWarning size={9} />
                  {addError()}
                </div>
              </Show>

              <div class="row gap-1">
                <button
                  class="pixel-btn is-active"
                  style={{ flex: "1", "font-size": "var(--fs-xs)" }}
                  onClick={handleAddServer}
                >
                  Save
                </button>
                <button
                  class="pixel-btn"
                  style={{ "font-size": "var(--fs-xs)" }}
                  onClick={() => { setShowAddForm(false); setAddError(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
          <button
            class="pixel-btn"
            style={{ width: "100%", "margin-top": "6px", "font-size": "var(--fs-xs)", gap: "4px" }}
            onClick={() => setShowAddForm(true)}
          >
            <IconPlus size={9} />
            Add Server
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ServerConnect;
