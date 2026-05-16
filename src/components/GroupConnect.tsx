/**
 * GroupConnect — the main entry screen.
 *
 * Layout:
 *   Your handle  [ name field ]
 *   Groups       [ dropdown | connect btn ]
 *                [ + Create a Group ]
 *                [ → Join a Group   ]
 *
 * Create: slides in below — name, key, CTA
 * Join:   slides in below — key, name, CTA
 */
import { Component, createEffect, createSignal, For, Show } from "solid-js";
import {
  IconPlus,
  IconArrowRight,
  IconWarning,
  IconSpinner,
  IconX,
  IconGear,
} from "./icons";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type { Server } from "../store/servers";
import { addServer } from "../store/servers";
import { setDisplayName as saveDisplayName } from "../store/identity";
import { setDisplayName as setStateDisplayName } from "../store/appState";
import { deriveServerName } from "../runtime/config";

interface Props {
  groups: Server[];
  currentName: string;
  connectError?: string;
  onConnect: (server: Server, name: string) => Promise<void>;
  onGroupsChange: () => void;
}

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
  const CREATE_SENTINEL = "__create_new_group__";
  const [mode, setMode] = createSignal<Mode>("home");
  const [name, setName] = createSignal(props.currentName || "");

  // Selected group in dropdown (default to most recent)
  const [selectedId, setSelectedId] = createSignal<string>(props.groups[0]?.id ?? "");

  createEffect(() => {
    const groups = props.groups;
    if (groups.length === 0) {
      setSelectedId("");
      return;
    }
    const current = selectedId();
    if (!current || (!groups.some(g => g.id === current) && current !== CREATE_SENTINEL)) {
      setSelectedId(groups[0].id);
    }
  });

  const getSelected = () => props.groups.find(g => g.id === selectedId()) ?? props.groups[0] ?? null;

  // Join flow
  const [joinKey, setJoinKey] = createSignal("");
  const [joinName, setJoinName] = createSignal("");
  const [joinError, setJoinError] = createSignal("");

  // Create flow
  const [createGroupName, setCreateGroupName] = createSignal("");
  const [generatedKey] = createSignal(generateKey());
  const [keyCopied, setKeyCopied] = createSignal(false);
  const [createError, setCreateError] = createSignal("");

  // General
  const [connecting, setConnecting] = createSignal<string | null>(null);

  const copyKey = async () => {
    await navigator.clipboard.writeText(generatedKey());
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

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
    const key = generatedKey();
    const groupName = createGroupName().trim() || deriveServerName(key);
    setCreateError("");
    const server = await addServer(groupName, key);
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
    const server = await addServer(groupName, k);
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

  const handleConnectSelected = async () => {
    const server = getSelected();
    if (!server) return;
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
        <span class="connect-tagline">Mesh Voice Chat</span>
      </div>

      {/* Name */}
      <div class="connect-form">
        <div>
          <label>Your Handle</label>
          <input
            class="pixel-input"
            type="text"
            placeholder="your callsign..."
            value={name()}
            maxLength={24}
            onInput={(e) => handleNameChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode() === "home" && props.groups.length > 0) {
                handleConnectSelected();
              }
            }}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck={false}
          />
        </div>

        {/* Connect error */}
        <Show when={props.connectError}>
          <div class="col gap-1">
            <div class="connect-form-error row gap-1">
              <IconWarning size={12} />
              {props.connectError}
            </div>
            <Show when={
              props.connectError?.toLowerCase().includes("not allowed") ||
              props.connectError?.toLowerCase().includes("permission") ||
              props.connectError?.toLowerCase().includes("denied")
            }>
              <button
                class="pixel-btn"
                style={{ "font-size": "var(--fs-xs)", "align-self": "flex-start" }}
                onClick={() =>
                  shellOpen("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone").catch(() => {})
                }
              >
                <IconGear size={11} />
                Open Mic Settings
              </button>
            </Show>
          </div>
        </Show>
      </div>

      {/* ── Home ── */}
      <Show when={mode() === "home"}>
        <div class="connect-form" style={{ gap: "8px" }}>

          {/* Groups section */}
          <div>
            <label>Groups</label>
            <div class="row gap-1">
              <select
                class="pixel-input"
                style={{ flex: 1 }}
                value={props.groups.length > 0 ? selectedId() : CREATE_SENTINEL}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (next === CREATE_SENTINEL) {
                    setMode("create");
                    return;
                  }
                  setSelectedId(next);
                }}
              >
                <For each={props.groups}>
                  {(g) => <option value={g.id}>{g.name}</option>}
                </For>
                <Show when={props.groups.length > 0}>
                  <option value={CREATE_SENTINEL}>──────────</option>
                </Show>
                <option value={CREATE_SENTINEL}>Create New Group</option>
              </select>
              <button
                class="pixel-btn is-active pixel-btn-icon"
                onClick={() => {
                  if (props.groups.length === 0 || selectedId() === CREATE_SENTINEL) {
                    setMode("create");
                    return;
                  }
                  handleConnectSelected();
                }}
                disabled={!!connecting()}
                title={props.groups.length === 0 ? "Create New Group" : "Connect"}
                style={{ "flex-shrink": 0 }}
              >
                <Show when={connecting() === getSelected()?.id} fallback={<IconArrowRight size={13} />}>
                  <IconSpinner size={13} />
                </Show>
              </button>
            </div>
          </div>
          <button
            class="pixel-btn"
            style={{ width: "100%", "font-size": "var(--fs-sm)", padding: "6px 10px" }}
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
          <div class="server-list-label">Create Group</div>

          <div>
            <label>Group Name (optional)</label>
            <input
              class="pixel-input"
              type="text"
              placeholder="My Team, Work Crew, etc."
              value={createGroupName()}
              onInput={(e) => setCreateGroupName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autocomplete="off"
            />
          </div>

          <div>
            <label>Group Key</label>
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
            <div class="setting-row-hint" style={{ "margin-top": "4px" }}>
              Click to copy — share this key to invite people.
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
          <div class="server-list-label">Join Group</div>

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
