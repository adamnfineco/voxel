/**
 * App — root component and lifecycle manager.
 *
 * Audio lifecycle:
 *   App.tsx owns: MediaStream, AudioContext (single shared instance)
 *   mesh.ts: uses the shared stream/context for WebRTC + speaking detection
 *   vad.ts:  uses the shared stream/context for VAD analysis
 *   micLevel.ts: uses the shared stream/context for level meter
 *
 * Connect flow:
 *   1. getUserMedia → MediaStream
 *   2. new AudioContext (shared)
 *   3. startAudio(stream, ctx)  → mesh layer
 *   4. startMicMonitor(stream, ctx) → level meter
 *   5. registerPTT / startVAD
 *   6. signalConnect, gossipConnect
 *   7. load channels, set role, announce connected
 *
 * On any failure: full teardown before surfacing error.
 */

import { Component, createSignal, onMount, Show } from "solid-js";
import { IconGear, IconInfo, IconLock } from "./components/icons";
import {
  identity, setIdentity,
  displayName, setDisplayName,
  servers, setServers,
  activeServer, setActiveServer,
  channels, setChannels,
  activeChannel, setActiveChannel,
  peers, setPeers, updatePeer, removePeer,
  setMicMuted,
  pttMode, setPttActive,
  setLocalSpeaking,
  setMicLevel,
  connected, setConnected,
  view, setView,
  setMyRole,
  queuedSpeaker, setQueuedSpeaker,
  connStatus, setConnStatus,
} from "./store/appState";
import { getOrCreateIdentity } from "./store/identity";
import {
  listServers,
  listChannels,
  createChannel,
  deleteChannel,
  removeServer,
  renameServer,
  touchServer,
  getRole,
  setRole,
  updateChannel,
} from "./store/servers";
import type { Server, Channel } from "./store/servers";
import {
  startAudio,
  stopAudio,
  setMicMuted as setAudioMicMuted,
  onSpeaking,
  switchInputDevice,
} from "./audio/mesh";
import { registerPTT, unregisterPTT, onPttChange, getCurrentKey } from "./audio/ptt";
import { startVAD, stopVAD, onVadActivity } from "./audio/vad";
import { initSounds, playSound, speak, speakChannelJoin } from "./audio/sounds";
import { startMicMonitor, stopMicMonitor, onMicLevel } from "./audio/micLevel";
import {
  connect as signalConnect,
  disconnect as signalDisconnect,
  announceChannelJoin,
  onChannelChange as onSignalChannelChange,
  onNameTaken,
  onServerError,
  onReconnecting,
} from "./sync/signaling";
import {
  connect as gossipConnect,
  disconnect as gossipDisconnect,
  broadcastChange,
  broadcastKick,
  onKick,
} from "./sync/gossip";
import { initDucking } from "./audio/ducking";
import { initE2EE } from "./audio/e2ee";
import { initKeyring, decryptRoomKey } from "./store/keyring";
import { getRendezvousUrl, stopSidecar } from "./runtime/sidecar";
import { setSwitchInputHandler, setReportNameTakenHandler } from "./runtime/bridge";
import ChannelTree from "./components/ChannelTree";
import MuteBar from "./components/MuteBar";
import GroupConnect from "./components/GroupConnect";
import Settings from "./components/Settings";
import ChannelModal, { type ChannelFormData } from "./components/ChannelModal";
import GroupInfoModal from "./components/GroupInfoModal";
import { hashPassword, verifyPassword } from "./store/crypto";

const AFK_TIMEOUT_MS = 5 * 60 * 1000;

const App: Component = () => {
  // Owned by App — never passed to children, only into audio modules
  let _stream: MediaStream | null = null;
  let _audioCtx: AudioContext | null = null;
  let _afkTimer: ReturnType<typeof setTimeout> | null = null;

  const [showChannelModal, setShowChannelModal] = createSignal<"create" | "edit" | null>(null);
  const [channelModalParentId, setChannelModalParentId] = createSignal<string | undefined>(undefined);
  const [editingChannel, setEditingChannel] = createSignal<Channel | null>(null);

  // Password prompt for password-protected channels
  const [showPasswordPrompt, setShowPasswordPrompt] = createSignal<Channel | null>(null);
  const [passwordInput, setPasswordInput] = createSignal("");
  const [passwordError, setPasswordError] = createSignal("");
  const [showGroupInfo, setShowGroupInfo] = createSignal(false);
  const [groupInfoKey, setGroupInfoKey] = createSignal("");
  const [connectError, setConnectError] = createSignal("");
  const [bootError, setBootError] = createSignal("");

  // ─── Boot ─────────────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      const id = await getOrCreateIdentity();
      setIdentity(id);
      if (id.display_name) setDisplayName(id.display_name);

      // Init keyring with app UUID — enables at-rest encryption of room keys
      await initKeyring(id.id);

      setServers(await listServers());

      // PTT press/release → state
      onPttChange((active) => {
        setPttActive(active);
        setLocalSpeaking(active);
      });

      // VAD activity → state
      onVadActivity((active) => setLocalSpeaking(active));

      // Remote speaking → update peer state + queued channel floor management
      onSpeaking((peerId, speaking) => {
        updatePeer(peerId, { speaking });
        enforceQueuedFloor(peerId, speaking);
      });

      // Mic level → state (drives meter UI)
      onMicLevel((level) => setMicLevel(level));

      // Remote channel changes
      onSignalChannelChange((peerId, channelId) => updatePeer(peerId, { channelId }));
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[app boot]", e);
      setBootError(msg);
    }
  });

  // ─── Audio + Connection teardown (shared between connect failure + disconnect) ──

  const teardownAudio = async () => {
    await unregisterPTT().catch(() => {});
    stopVAD();
    stopMicMonitor();
    await stopAudio().catch(() => {});

    _stream?.getTracks().forEach((t) => t.stop());
    _stream = null;

    if (_audioCtx && _audioCtx.state !== "closed") {
      await _audioCtx.close().catch(() => {});
    }
    _audioCtx = null;

    if (_afkTimer) { clearTimeout(_afkTimer); _afkTimer = null; }

    setMicLevel(0);
    setLocalSpeaking(false);
    setPttActive(false);
  };

  // ─── Connect ──────────────────────────────────────────────────────────────

  const handleConnect = async (server: Server, name: string) => {
    const id = identity();
    if (!id) return;

    setConnectError("");

    try {
      // 1. Acquire mic stream
      _stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48_000,
        },
        video: false,
      });

      // 2. Single shared AudioContext for all audio processing
      _audioCtx = new AudioContext({ sampleRate: 48_000, latencyHint: "interactive" });

      // Resume immediately — some browsers start suspended
      if (_audioCtx.state === "suspended") {
        await _audioCtx.resume();
      }

      // 3. Ducking node — remote audio routes through this
      const duckNode = initDucking(_audioCtx);

      // 4a. Decrypt the room key (may be stored encrypted at rest)
      const roomKey = await decryptRoomKey(server.server_key);

      // 4b. Initialise E2EE — derive media key from room key
      await initE2EE(roomKey);

      // 4. Wire audio layer (mesh routes remote audio through duckNode)
      startAudio(_stream, _audioCtx, duckNode);

      // 5. Init synthesised sounds with shared ctx
      initSounds(_audioCtx);

      // 6. Mic level monitor
      startMicMonitor(_stream, _audioCtx);

      // 7. Transmit mode
      if (pttMode()) {
        await registerPTT(getCurrentKey()); // use whatever key the user configured
        setMicMuted(true);
        setAudioMicMuted(true);
      } else {
        startVAD(_stream, _audioCtx);
      }

      // 8. Wire name-taken + server-error callbacks before connecting
      onNameTaken(() => {
        setConnectError(`Name "${name}" is already taken. Choose a different name.`);
        handleDisconnect();
      });
      setReportNameTakenHandler(() => {
        setConnectError(`Name "${name}" is already taken. Choose a different name.`);
      });
      onServerError((msg) => {
        setConnectError(`Server error: ${msg}`);
        handleDisconnect();
      });

      // 9. Wire kick callback
      onKick(() => {
        setConnectError("You were kicked from the server.");
        handleDisconnect();
      });

      // 9a. Reconnecting status feedback
      onReconnecting(() => {
        setConnStatus("reconnecting");
      });

      // 10. Resolve rendezvous URL — auto-starts embedded sidecar if needed
      setConnStatus("connecting");
      const rendezvousUrl = await getRendezvousUrl();

      // 11. Signaling (returns when WS is open) — use decrypted room key
      await signalConnect(rendezvousUrl, server.id, id.id, name, roomKey);

      // 12. Gossip (state sync layer) — use decrypted room key
      await gossipConnect(rendezvousUrl, server.id, id.id, roomKey);

      // 12. Wire device switcher so Settings can call it
      setSwitchInputHandler(async (deviceId: string) => {
        const newStream = await switchInputDevice(deviceId);
        _stream = newStream;
        stopMicMonitor();
        startMicMonitor(newStream, _audioCtx!);
        if (!pttMode()) {
          stopVAD();
          startVAD(newStream, _audioCtx!);
        }
      });

      // 13. Load or create default channels
      let chs = await listChannels(server.id);
      if (chs.length === 0) {
        const lobby = await createChannel(server.id, "Lobby", { createdBy: id.id });
        const afkCh = await createChannel(server.id, "AFK", {
          isAfk: true,
          afkTimeoutSeconds: 300,
          createdBy: id.id,
        });
        chs = [lobby, afkCh];
        await broadcastChange("channel_create", JSON.stringify(lobby));
        await broadcastChange("channel_create", JSON.stringify(afkCh));
      }
      setChannels(chs);

      // Auto-join a default channel immediately.
      // Connected users should always be in some channel, never "floating".
      const defaultChannel =
        chs.find((c) => c.name === "Lobby") ??
        chs.find((c) => !c.is_afk) ??
        chs[0];

      // 14. Assign role (first connection = owner)
      const existingRole = await getRole(server.id, id.id);
      if (!existingRole) {
        await setRole(server.id, id.id, "owner", name, id.id);
        setMyRole("owner");
      } else {
        setMyRole(existingRole.role as "owner" | "admin" | "member");
      }

      // 15. Mark connected
      await touchServer(server.id);
      setActiveServer(server);
      setConnected(true);
      setConnStatus("connected");
      setView("main");

      // Land in Lobby (or first non-AFK channel) immediately
      if (defaultChannel) {
        await doJoinChannel(defaultChannel);
      }

      playSound("connect");
      speak(`Connected to ${server.name}`);
      resetAfkTimer();

    } catch (e) {
      // Full cleanup on any failure — leave no dangling streams/contexts/sockets
      signalDisconnect();
      gossipDisconnect();
      await teardownAudio();
      setConnStatus("disconnected");
      const msg = e instanceof Error ? e.message : String(e);
      setConnectError(`Connection failed: ${msg}`);
      console.error("[app] connect failed:", e);
    }
  };

  // ─── Disconnect ───────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    signalDisconnect();
    gossipDisconnect();
    await teardownAudio();
    // Stop sidecar if we were auto-hosting
    await stopSidecar().catch(() => {});
    setSwitchInputHandler(null);
    setReportNameTakenHandler(null);

    setConnected(false);
    setConnStatus("disconnected");
    setActiveServer(null);
    setActiveChannel(null);
    setPeers(new Map());
    setShowGroupInfo(false);
    setGroupInfoKey("");
    setView("connect");
    setConnectError("");

    playSound("disconnect");
  };

  // ─── Channels ─────────────────────────────────────────────────────────────

  const doJoinChannel = async (channel: Channel) => {
    const id = identity();
    if (!id || !activeServer()) return;
    setActiveChannel(channel);
    announceChannelJoin(channel.id);
    updatePeer(id.id, { channelId: channel.id, displayName: displayName() });
    speakChannelJoin(channel.name);
    playSound("channel_join");
    resetAfkTimer();
  };

  const handleJoinChannel = async (channel: Channel) => {
    // Check max users
    if (channel.max_users !== null) {
      const currentCount = Array.from(peers().values())
        .filter(p => p.channelId === channel.id).length;
      if (currentCount >= channel.max_users) {
        // Channel is full — show a brief UI error rather than silently failing
        setConnectError(`#${channel.name} is full (${channel.max_users}/${channel.max_users})`);
        setTimeout(() => setConnectError(""), 3000);
        return;
      }
    }

    // If channel has a password, prompt before joining
    if (channel.password_hash) {
      setShowPasswordPrompt(channel);
      setPasswordInput("");
      setPasswordError("");
    } else {
      await doJoinChannel(channel);
    }
  };

  const handlePasswordSubmit = async () => {
    const channel = showPasswordPrompt();
    if (!channel) return;
    const ok = await verifyPassword(passwordInput(), channel.password_hash ?? "");
    if (!ok) {
      setPasswordError("Wrong password.");
      return;
    }
    setShowPasswordPrompt(null);
    setPasswordInput("");
    setPasswordError("");
    await doJoinChannel(channel);
  };

  const handleCreateChannel = (parentId?: string) => {
    setChannelModalParentId(parentId);
    setEditingChannel(null);
    setShowChannelModal("create");
  };

  const handleEditChannel = (channel: Channel) => {
    setEditingChannel(channel);
    setShowChannelModal("edit");
  };

  const handleDeleteChannel = async (channel: Channel) => {
    const server = activeServer();
    if (!server) return;
    await deleteChannel(channel.id);
    setChannels(channels().filter((c) => c.id !== channel.id));
    if (activeChannel()?.id === channel.id) {
      setActiveChannel(null);
      announceChannelJoin(null);
    }
    await broadcastChange("channel_delete", JSON.stringify({ id: channel.id }));
  };

  const handleChannelModalConfirm = async (data: ChannelFormData) => {
    const server = activeServer();
    const id = identity();
    if (!server || !id) return;

    const passwordHash = data.password ? await hashPassword(data.password) : null;

    if (showChannelModal() === "create") {
      const ch = await createChannel(server.id, data.name, {
        parentId: channelModalParentId(),
        isAfk: data.isAfk,
        isQueued: data.isQueued,
        maxUsers: data.maxUsers ?? undefined,
        createdBy: id.id,
      });
      // Store password hash locally
      if (passwordHash) {
        const updated = { ...ch, password_hash: passwordHash };
        await updateChannel(updated);
        setChannels([...channels(), updated]);
        await broadcastChange("channel_create", JSON.stringify(updated));
      } else {
        setChannels([...channels(), ch]);
        await broadcastChange("channel_create", JSON.stringify(ch));
      }
    } else if (showChannelModal() === "edit") {
      const ch = editingChannel();
      if (!ch) return;
      const updated: Channel = {
        ...ch,
        name: data.name,
        is_afk: data.isAfk,
        is_queued: data.isQueued,
        max_users: data.maxUsers,
        password_hash: passwordHash ?? ch.password_hash,
        updated_at: Date.now(),
      };
      await updateChannel(updated);
      setChannels(channels().map((c) => c.id === ch.id ? updated : c));
      await broadcastChange("channel_update", JSON.stringify(updated));
    }

    setShowChannelModal(null);
    setEditingChannel(null);
  };

  const handleKickUser = async (peerId: string) => {
    // Broadcast kick to all peers so the target disconnects
    await broadcastKick(peerId).catch(() => {});
    // Also remove locally
    removePeer(peerId);
  };

  // ─── Queued channel floor management ──────────────────────────────────────

  /**
   * In queued channels, only one person may speak at a time.
   * When a remote peer starts speaking: if we're in the same queued channel
   * and we're transmitting, mute ourselves (they got the floor).
   */
  const enforceQueuedFloor = (peerId: string, speaking: boolean) => {
    const ch = activeChannel();
    if (!ch?.is_queued) return;

    const id = identity();
    const peerInfo = peers().get(peerId);
    if (!peerInfo || peerInfo.channelId !== ch.id) return;

    if (speaking) {
      setQueuedSpeaker(peerId);
      // If we're speaking and a remote peer grabbed the floor, mute us
      if (id && peerId !== id.id) {
        setMicMuted(true);
        setAudioMicMuted(true);
        setLocalSpeaking(false);
        setPttActive(false);
      }
    } else {
      // Only clear if this peer was the current speaker
      if (queuedSpeaker() === peerId) {
        setQueuedSpeaker(null);
      }
    }
  };

  // ─── AFK timer ────────────────────────────────────────────────────────────

  const resetAfkTimer = () => {
    if (_afkTimer) { clearTimeout(_afkTimer); _afkTimer = null; }
    const me = identity();
    if (!me) return;
    updatePeer(me.id, { afk: false });

    const afkCh = channels().find((c) => c.is_afk);
    if (!afkCh) return;

    _afkTimer = setTimeout(async () => {
      if (activeChannel()?.is_afk) return;
      updatePeer(me.id, { afk: true });
      await handleJoinChannel(afkCh);
      setMicMuted(true);
      setAudioMicMuted(true);
    }, AFK_TIMEOUT_MS);
  };

  const refreshServers = async () => setServers(await listServers());

  const openGroupInfo = async () => {
    const s = activeServer();
    if (!s) return;
    setGroupInfoKey(await decryptRoomKey(s.server_key));
    setShowGroupInfo(true);
  };

  const handleRenameActiveGroup = async (newName: string) => {
    const s = activeServer();
    if (!s) return;
    await renameServer(s.id, newName);
    const updated = { ...s, name: newName };
    setActiveServer(updated);
    setServers(await listServers());
  };

  const handleDeleteActiveGroup = async () => {
    const s = activeServer();
    if (!s) return;
    await handleDisconnect();
    await removeServer(s.id);
    await refreshServers();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div class="app-root">
      {/* CRT overlay — fixed, pointer-events-none, GPU-composited */}
      <div class="crt-overlay" aria-hidden="true" />

      <Show when={bootError()}>
        <div class="connect-screen" style={{ padding: "16px", "justify-content": "flex-start" }}>
          <div class="connect-logo-wrap">
            <span class="connect-logo">VOXEL</span>
            <span class="connect-tagline">boot error</span>
          </div>
          <div class="pixel-border" style={{ width: "100%", "max-width": "320px", padding: "12px", background: "var(--c-bg2)" }}>
            <div class="text-muted text-xs" style={{ "white-space": "pre-wrap", "line-height": "1.8" }}>
              {bootError()}
            </div>
          </div>
        </div>
      </Show>

      {/* Settings */}
      <Show when={!bootError() && view() === "settings"}>
        <Settings onClose={() => setView(connected() ? "main" : "connect")} />
      </Show>

      {/* Connect screen */}
      <Show when={!bootError() && view() === "connect"}>
        <div class="app-header">
          <span class="app-header-logo">VOXEL</span>
          <div style={{ flex: 1 }} />
          <button class="pixel-btn pixel-btn-icon" onClick={() => setView("settings")} title="Settings">
            <IconGear size={11} />
          </button>
        </div>

        <GroupConnect
          groups={servers()}
          currentName={displayName()}
          connectError={connectError()}
          onConnect={handleConnect}
          onGroupsChange={refreshServers}
        />
      </Show>

      {/* Main view */}
      <Show when={!bootError() && view() === "main"}>
        <div class="app-header">
          <span class="app-header-logo">VOXEL</span>
          <div class="app-header-meta">
            {/* Connection status dot */}
            <span style={{
              width: "6px",
              height: "6px",
              background: connStatus() === "connected" ? "var(--c-speaking)"
                : connStatus() === "reconnecting" ? "var(--c-warning)"
                : "var(--c-muted)",
              display: "inline-block",
              "flex-shrink": "0",
              animation: connStatus() === "reconnecting" ? "speaking-pulse 1s ease-in-out infinite" : "none",
            }} title={connStatus()} />
            <span>{displayName()}</span>
            <span class="app-header-sep">/</span>
            <span>{activeServer()?.name}</span>
            {/* Peer count */}
            <Show when={peers().size > 0}>
              <span class="app-header-sep">·</span>
              <span style={{ color: "var(--c-speaking)", "font-size": "var(--fs-xs)" }}>
                {peers().size} peer{peers().size !== 1 ? "s" : ""}
              </span>
            </Show>
          </div>
          <button
            class="pixel-btn pixel-btn-icon"
            onClick={openGroupInfo}
            title="Group Info"
            style={{ "margin-left": "6px" }}
          >
            <IconInfo size={11} />
          </button>
          <button
            class="pixel-btn pixel-btn-icon"
            onClick={() => setView("settings")}
            title="Settings"
            style={{ "margin-left": "6px" }}
          >
            <IconGear size={11} />
          </button>
        </div>

        <div class="app-body">
          <ChannelTree
            channels={channels()}
            peers={peers()}
            serverId={activeServer()?.id ?? ""}
            serverName={activeServer()?.name ?? ""}
            onJoinChannel={handleJoinChannel}
            onCreateChannel={handleCreateChannel}
            onDeleteChannel={handleDeleteChannel}
            onEditChannel={handleEditChannel}
            onKickUser={handleKickUser}
          />
        </div>

        <MuteBar
          onDisconnect={handleDisconnect}
          onOpenSettings={() => setView("settings")}
        />
      </Show>

      {/* Channel create/edit modal */}
      <Show when={showChannelModal()}>
        <ChannelModal
          mode={showChannelModal()!}
          initial={editingChannel() ? {
            name: editingChannel()!.name,
            isAfk: editingChannel()!.is_afk,
            isQueued: editingChannel()!.is_queued,
            maxUsers: editingChannel()!.max_users,
          } : undefined}
          onConfirm={handleChannelModalConfirm}
          onCancel={() => { setShowChannelModal(null); setEditingChannel(null); }}
        />
      </Show>

      {/* Password prompt for protected channels */}
      <Show when={showPasswordPrompt()}>
        {(ch) => (
          <div
            class="modal-backdrop"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPasswordPrompt(null); }}
          >
            <div class="modal-box">
              <div class="modal-title row gap-1">
                <IconLock size={13} />
                {ch().name}
              </div>
              <div class="setting-row-hint">This channel is password protected.</div>
              <input
                class="pixel-input"
                type="password"
                placeholder="enter channel password..."
                value={passwordInput()}
                onInput={(e) => { setPasswordInput(e.currentTarget.value); setPasswordError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                autofocus
              />
              <Show when={passwordError()}>
                <div class="text-muted" style={{ "font-size": "var(--fs-sm)" }}>{passwordError()}</div>
              </Show>
              <div class="row gap-1">
                <button
                  class="pixel-btn is-active"
                  style={{ flex: "1", "font-size": "var(--fs)" }}
                  onClick={handlePasswordSubmit}
                >
                  Join
                </button>
                <button
                  class="pixel-btn"
                  style={{ "font-size": "var(--fs)" }}
                  onClick={() => setShowPasswordPrompt(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Active group info/settings */}
      <Show when={showGroupInfo() && activeServer()}>
        <GroupInfoModal
          groupName={activeServer()!.name}
          groupKey={groupInfoKey()}
          peerCount={peers().size}
          channelCount={channels().length}
          onRename={handleRenameActiveGroup}
          onDelete={handleDeleteActiveGroup}
          onClose={() => setShowGroupInfo(false)}
        />
      </Show>
    </div>
  );
};

export default App;
