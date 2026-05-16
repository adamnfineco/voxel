/**
 * GroupConnect — the main entry screen.
 *
 * UX philosophy: anyone can create a group or join one.
 * No "Signal URL", no infrastructure details.
 * Just: Create a group (generates a key) or Join one (enter a key).
 *
 * A "group" is what we used to call a "server" internally.
 * Externally it's a voice room — named, keyed, self-contained.
 */
import { Component, createSignal, For, Show } from "solid-js";
import {
  IconPlus,
  IconArrowRight,
  IconWarning,
  IconSpinner,
  IconWifi,
  IconX,
} from "./icons";
import type { Server } from "../store/servers";
import { addServer } from "../store/servers";
import { setDisplayName as saveDisplayName } from "../store/identity";
import { setDisplayName as setStateDisplayName } from "../store/appState";
import { deriveServerName } from "../runtime/config";
import { encryptRoomKey } from "../store/keyring";

interface Props {
  groups: Server[];
  currentName: string;
  connectError?: string;
  onConnect: (server: Server, name: string) => Promise<void>;
  onGroupsChange: () => void;
}

/** Format a timestamp as a human-friendly relative string */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Generate a short human-friendly group key */
function generateKey(): string {
  const words = [
    "echo","fox","golf","hotel","india","kilo","lima","mike",
    "nova","oscar","papa","romeo","sierra","tango","victor",
    "whisky","xray","yankee","zulu","alpha","bravo","charlie","delta",
  ];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${w1}-${w2}-${num}`;
}

const GroupConnect: Component<Props> = (props) => {
  type Mode = "home" | "create" | "join";
  const [mode, setMode] = createSignal<Mode>("home");
  const [name, setName] = createSignal(props.currentName || "");

  // Join flow
  const [joinKey, setJoinKey] = createSignal("");
  const [joinName, setJoinName] = createSignal("");
  const [joinError, setJoinError] = createSignal("");

  // Create flow
  const [createGroupName, setCreateGroupName] = createSignal("");
  const [generatedKey] = createSignal(generateKey());
  const [keyCopied, setKeyCopied] = createSignal(false);

  const copyKey = async () => {
    await navigator.clipboard.writeText(generatedKey());
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };
  const [createError, setCreateError] = createSignal("");

  // General
  const [connecting, setConnecting] = createSignal<string | null>(null);

  const handleNameChange = async (val: string) => {
    setName(val);
    setStateDisplayName(val);
    await saveDisplayName(val);
  };

  const validateName = () => {
    const n = name().trim();
    if (!n) return "Enter your name first.";
    if (n.length > 24) return "Name too long — max 24 characters.";
    return null;
  };

  const handleCreate = async () => {
    const nameErr = validateName();
    if (nameErr) { setCreateError(nameErr); return; }

    const key = generatedKey;
    const groupName = createGroupName().trim() || deriveServerName(key());
    setCreateError("");

    const encryptedKey = await encryptRoomKey(key());
    const server = await addServer(groupName, encryptedKey);
    setConnecting(server.id);
    try {
      await props.onConnect(server, name().trim());
      props.onGroupsChange();
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setConnecting(null);
    }
  };

  const handleJoin = async () => {
    const nameErr = validateName();
    if (nameErr) { setJoinError(nameErr); return; }
    const k = joinKey().trim();
    if (!k) { setJoinError("Enter the group key."); return; }
    setJoinError("");

    const groupName = joinName().trim() || deriveServerName(k);
    const encryptedKey = await encryptRoomKey(k);
    const server = await addServer(groupName, encryptedKey);
    setConnecting(server.id);
    try {
      await props.onConnect(server, name().trim());
      props.onGroupsChange();
    } catch (e) {
      setJoinError(String(e));
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectExisting = async (server: Server) => {
    const nameErr = validateName();
    if (nameErr) { setJoinError(nameErr); return; }
    setConnecting(server.id);
    try {
      await props.onConnect(server, name().trim());
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div class="connect-screen">
      {/* Logo */}
      <div class="connect-logo-wrap">
        <span class="connect-logo">VOXEL</span>
        <span class="connect-tagline">voice · mesh · peer-to-peer</span>
      </div>

      {/* Your name — always visible */}
      <div class="connect-form">
        <div>
          <label>Your Name</label>
          <input
            class="pixel-input"
            type="text"
            placeholder="your callsign..."
            value={name()}
            maxLength={24}
            onInput={(e) => handleNameChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode() === "home" && props.groups.length > 0) {
                handleConnectExisting(props.groups[0]);
              }
            }}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck={false}
          />
        </div>

        <Show when={props.connectError}>
          <div class="connect-form-error row gap-1">
            <IconWarning size={12} />
            {props.connectError}
          </div>
        </Show>
      </div>

      {/* ── Home: Create or Join ── */}
      <Show when={mode() === "home"}>
        {/* Recent groups */}
        <Show when={props.groups.length > 0}>
          <div class="server-list">
            <div class="server-list-label row gap-1">
              <IconWifi size={10} />
              Recent Groups
            </div>
            <For each={props.groups}>
              {(server) => (
                <div
                  class="server-item"
                  onClick={() => handleConnectExisting(server)}
                  title={`Connect to ${server.name}`}
                >
                  <div class="server-item-info">
                    <span class="server-item-name">{server.name}</span>
                    <Show when={server.last_connected}>
                      <span class="server-item-url">
                        last used {formatRelative(server.last_connected!)}
                      </span>
                    </Show>
                  </div>
                  <Show
                    when={connecting() === server.id}
                    fallback={<IconArrowRight size={13} color="var(--c-text-dim)" />}
                  >
                    <IconSpinner size={13} color="var(--c-accent)" />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Action buttons */}
        <div class="connect-form" style={{ gap: "8px" }}>
          <button
            class="pixel-btn is-active"
            style={{ width: "100%", "font-size": "var(--fs)", padding: "8px 12px" }}
            onClick={() => setMode("create")}
          >
            <IconPlus size={13} />
            Create a Group
          </button>
          <button
            class="pixel-btn"
            style={{ width: "100%", "font-size": "var(--fs)", padding: "8px 12px" }}
            onClick={() => setMode("join")}
          >
            <IconArrowRight size={13} />
            Join a Group
          </button>
        </div>
      </Show>

      {/* ── Create flow ── */}
      <Show when={mode() === "create"}>
        <div class="connect-form">
          <div style={{ "font-size": "var(--fs-sm)", color: "var(--c-text-dim)", "text-transform": "uppercase", "letter-spacing": "1px" }}>
            Create Group
          </div>

          <div>
            <label>Group Name (optional)</label>
            <input
              class="pixel-input"
              type="text"
              placeholder="My Team, Work Crew, etc."
              value={createGroupName()}
              onInput={(e) => setCreateGroupName(e.currentTarget.value)}
              autocomplete="off"
            />
          </div>

          {/* Show generated key + copy button */}
          <div>
            <label>Your Group Key</label>
            <div
              onClick={copyKey}
              title="Click to copy"
              style={{
                background: "var(--c-panel)",
                border: "2px solid var(--c-border)",
                padding: "8px 10px",
                "font-family": "\"Press Start 2P\", monospace",
                "font-size": "var(--fs-sm)",
                color: keyCopied() ? "var(--c-speaking)" : "var(--c-accent)",
                "letter-spacing": "2px",
                "word-break": "break-all",
                cursor: "pointer",
                "user-select": "all",
                transition: "color 200ms linear",
              }}
            >
              {keyCopied() ? "copied!" : generatedKey()}
            </div>
            <div class="setting-row-hint" style={{ "font-size": "var(--fs-sm)", "margin-top": "4px" }}>
              Click to copy. Share this key with anyone you want to invite.
            </div>
          </div>

          <Show when={createError()}>
            <div class="connect-form-error row gap-1">
              <IconWarning size={12} />
              {createError()}
            </div>
          </Show>

          <div class="row gap-1">
            <button
              class="pixel-btn is-active"
              style={{ flex: "1", "font-size": "var(--fs)", padding: "7px 12px" }}
              onClick={handleCreate}
              disabled={!!connecting()}
            >
              {connecting() ? <IconSpinner size={13} /> : <IconPlus size={13} />}
              Create &amp; Join
            </button>
            <button
              class="pixel-btn"
              style={{ "font-size": "var(--fs)", padding: "7px 10px" }}
              onClick={() => { setMode("home"); setCreateError(""); }}
            >
              <IconX size={13} />
            </button>
          </div>
        </div>
      </Show>

      {/* ── Join flow ── */}
      <Show when={mode() === "join"}>
        <div class="connect-form">
          <div style={{ "font-size": "var(--fs-sm)", color: "var(--c-text-dim)", "text-transform": "uppercase", "letter-spacing": "1px" }}>
            Join Group
          </div>

          <div>
            <label>Group Key</label>
            <input
              class="pixel-input"
              type="text"
              placeholder="echo-golf-491"
              value={joinKey()}
              onInput={(e) => setJoinKey(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck={false}
              autofocus
            />
          </div>

          <div>
            <label>Group Name (optional)</label>
            <input
              class="pixel-input"
              type="text"
              placeholder="friendly nickname"
              value={joinName()}
              onInput={(e) => setJoinName(e.currentTarget.value)}
              autocomplete="off"
            />
          </div>

          <Show when={joinError()}>
            <div class="connect-form-error row gap-1">
              <IconWarning size={12} />
              {joinError()}
            </div>
          </Show>

          <div class="row gap-1">
            <button
              class="pixel-btn is-active"
              style={{ flex: "1", "font-size": "var(--fs)", padding: "7px 12px" }}
              onClick={handleJoin}
              disabled={!!connecting()}
            >
              {connecting() ? <IconSpinner size={13} /> : <IconArrowRight size={13} />}
              Join
            </button>
            <button
              class="pixel-btn"
              style={{ "font-size": "var(--fs)", padding: "7px 10px" }}
              onClick={() => { setMode("home"); setJoinError(""); setJoinKey(""); }}
            >
              <IconX size={13} />
            </button>
          </div>
        </div>
      </Show>

    </div>
  );
};

export default GroupConnect;
