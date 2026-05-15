import { Component, createSignal, createEffect, For, onMount, Show } from "solid-js";
import {
  IconAudio,
  IconKeyboard,
  IconInfo,
  IconArrowLeft,
  IconWarning,
} from "./icons";
import {
  settingsTab, setSettingsTab,
  pttMode, setPttMode,
  connected,
} from "../store/appState";
import {
  registerPTT,
  getCurrentKey,
  eventToTauriKey,
  keyDisplayLabel,
} from "../audio/ptt";
import { listAudioDevices, type AudioDevice } from "../audio/mesh";
import {
  setSoundsEnabled,
  setSoundVolume,
  setTTSEnabled,
  setTTSRate,
} from "../audio/sounds";
import { setDuckingEnabled } from "../audio/ducking";
import { setThreshold, setSilenceHold } from "../audio/vad";
import { getSwitchInputHandler } from "../runtime/bridge";

interface Props {
  onClose: () => void;
}

const Settings: Component<Props> = (props) => {
  const [inputDevices, setInputDevices] = createSignal<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = createSignal<AudioDevice[]>([]);
  const [selectedInput, setSelectedInput] = createSignal("default");
  const [selectedOutput, setSelectedOutput] = createSignal("default");
  const [pttKey, setPttKey] = createSignal(getCurrentKey());
  const [listeningForKey, setListeningForKey] = createSignal(false);
  const [pttError, setPttError] = createSignal("");
  const [soundsOn, setSoundsOn] = createSignal(true);
  const [ttsOn, setTtsOn] = createSignal(true);
  const [duckingOn, setDuckingOn] = createSignal(true);
  const [vadThreshold, setVadThreshold] = createSignal(15);
  const [silenceHoldMs, setSilenceHoldMs] = createSignal(800);
  const [vol, setVol] = createSignal(50);
  const [ttsRate, setTtsRateLocal] = createSignal(1.0);
  const [switchingDevice, setSwitchingDevice] = createSignal(false);
  const [deviceError, setDeviceError] = createSignal("");

  const refreshDevices = async () => {
    try {
      // On macOS, labels are only populated after mic permission is granted.
      // enumerateDevices() before permission returns devices with empty labels
      // and may omit audioinput entirely — so only enumerate after connecting.
      const devices = await listAudioDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");

      // If labels are all empty, permission hasn't been granted yet
      const hasLabels = inputs.some((d) => d.label.length > 0);
      if (hasLabels || inputs.length > 0) {
        setInputDevices(inputs);
        setOutputDevices(outputs);
        // Pre-select the default device
        if (inputs.length > 0 && !selectedInput()) setSelectedInput(inputs[0].deviceId);
        if (outputs.length > 0 && !selectedOutput()) setSelectedOutput(outputs[0].deviceId);
      }
    } catch {
      // Silently ignore — devices will be empty with a helpful message shown
    }
  };

  onMount(async () => {
    await refreshDevices();
  });

  // Re-enumerate whenever connected state changes (mic permission just granted)
  createEffect(() => {
    connected(); // track signal — re-run effect when connection state changes
    refreshDevices();
  });

  const listenForKey = () => {
    setListeningForKey(true);
    setPttError("");

    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Convert full event (including modifiers) to Tauri key string
      const tauriKey = eventToTauriKey(e);

      // Ignore pure modifier presses — wait for an actual key
      if (!tauriKey) return;

      setPttKey(tauriKey);
      setListeningForKey(false);
      document.removeEventListener("keydown", handler, true);

      try {
        await registerPTT(tauriKey);
      } catch {
        setPttError(`Could not register "${keyDisplayLabel(tauriKey)}" — try a different key.`);
      }
    };

    document.addEventListener("keydown", handler, true);
  };

  const handleInputChange = async (deviceId: string) => {
    setSelectedInput(deviceId);
    const switchInput = getSwitchInputHandler();
    if (!connected() || !switchInput) return;
    setSwitchingDevice(true);
    setDeviceError("");
    try {
      await switchInput(deviceId);
    } catch (e) {
      setDeviceError("Failed to switch microphone.");
      console.error("[settings] device switch error:", e);
    } finally {
      setSwitchingDevice(false);
    }
  };

  const tabs: { id: "audio" | "keybinds" | "general"; label: string; icon: () => any }[] = [
    { id: "audio",    label: "Audio",    icon: () => <IconAudio size={10} /> },
    { id: "keybinds", label: "Keybinds", icon: () => <IconKeyboard size={10} /> },
    { id: "general",  label: "About",    icon: () => <IconInfo size={10} /> },
  ];

  return (
    <div class="settings-screen">
      {/* Header */}
      <div class="app-header">
        <button
          class="pixel-btn pixel-btn-icon"
          onClick={props.onClose}
          title="Back"
          style={{ "margin-right": "8px" }}
        >
          <IconArrowLeft size={11} />
        </button>
        <span class="app-header-logo">SETTINGS</span>
      </div>

      {/* Tabs */}
      <div class="settings-tabs">
        <For each={tabs}>
          {(tab) => (
            <div
              class={`settings-tab${settingsTab() === tab.id ? " is-active" : ""}`}
              onClick={() => setSettingsTab(tab.id)}
            >
              <span class="row gap-1">{tab.icon()}{tab.label}</span>
            </div>
          )}
        </For>
      </div>

      <div class="settings-body">

        {/* ── Audio ── */}
        <Show when={settingsTab() === "audio"}>

          <div class="setting-group">
            <div class="row gap-1" style={{ "justify-content": "space-between", "align-items": "center", "margin-bottom": "4px" }}>
              <div class="setting-group-label" style={{ margin: 0 }}>Devices</div>
              <button
                class="pixel-btn"
                style={{ "font-size": "var(--fs-xs)", padding: "2px 8px" }}
                onClick={refreshDevices}
                title="Refresh device list"
              >
                Refresh
              </button>
            </div>

            <div class="setting-row">
              <label>
                Microphone
                <Show when={switchingDevice()}>
                  <span class="text-dim text-xs"> — switching…</span>
                </Show>
              </label>
              <Show
                when={inputDevices().length > 0}
                fallback={
                  <div class="text-dim text-xs" style={{ "line-height": "1.8" }}>
                    <Show
                      when={connected()}
                      fallback={"Connect to a group first — mic permission is requested on join."}
                    >
                      No microphone found. Check System Settings → Privacy → Microphone.
                    </Show>
                  </div>
                }
              >
                <select
                  class="pixel-input"
                  value={selectedInput()}
                  onChange={(e) => handleInputChange(e.currentTarget.value)}
                  disabled={switchingDevice()}
                >
                  <For each={inputDevices()}>
                    {(d) => <option value={d.deviceId}>{d.label}</option>}
                  </For>
                </select>
              </Show>
              <Show when={deviceError()}>
                <div class="connect-form-error row gap-1">
                  <IconWarning size={9} />
                  {deviceError()}
                </div>
              </Show>
            </div>

            <div class="setting-row">
              <label>Output (speakers)</label>
              <Show
                when={outputDevices().length > 0}
                fallback={<div class="text-dim text-xs">Connect to a group first to enumerate output devices.</div>}
              >
                <select
                  class="pixel-input"
                  value={selectedOutput()}
                  onChange={(e) => setSelectedOutput(e.currentTarget.value)}
                >
                  <For each={outputDevices()}>
                    {(d) => <option value={d.deviceId}>{d.label}</option>}
                  </For>
                </select>
              </Show>
              <div class="setting-row-hint">
                Output switching via WebRTC is browser-controlled. Connect first to see devices.
              </div>
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-group-label">Playback</div>

            <div class="setting-row is-horizontal">
              <label>Audio ducking</label>
              <input
                type="checkbox"
                checked={duckingOn()}
                onChange={(e) => {
                  setDuckingOn(e.currentTarget.checked);
                  setDuckingEnabled(e.currentTarget.checked);
                }}
              />
            </div>
            <div class="setting-row-hint">Lower remote audio when you transmit.</div>

            <div class="setting-row is-horizontal">
              <label>Event sounds</label>
              <input
                type="checkbox"
                checked={soundsOn()}
                onChange={(e) => {
                  setSoundsOn(e.currentTarget.checked);
                  setSoundsEnabled(e.currentTarget.checked);
                }}
              />
            </div>

            <div class="setting-row">
              <label>Volume — {vol()}%</label>
              <input
                type="range" min={0} max={100} step={1}
                value={vol()}
                onInput={(e) => {
                  const v = parseInt(e.currentTarget.value);
                  setVol(v);
                  setSoundVolume(v / 100);
                }}
              />
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-group-label">TTS</div>

            <div class="setting-row is-horizontal">
              <label>Join/leave announcements</label>
              <input
                type="checkbox"
                checked={ttsOn()}
                onChange={(e) => {
                  setTtsOn(e.currentTarget.checked);
                  setTTSEnabled(e.currentTarget.checked);
                }}
              />
            </div>

            <div class="setting-row">
              <label>Speed — {ttsRate().toFixed(1)}x</label>
              <input
                type="range" min={0.5} max={2.0} step={0.1}
                value={ttsRate()}
                onInput={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  setTtsRateLocal(v);
                  setTTSRate(v);
                }}
              />
            </div>
          </div>
        </Show>

        {/* ── Keybinds ── */}
        <Show when={settingsTab() === "keybinds"}>

          <div class="setting-group">
            <div class="setting-group-label">Transmit Mode</div>
            <div class="setting-row is-horizontal">
              <label>Mode</label>
              <div class="row gap-1">
                <button
                  class={`pixel-btn${pttMode() ? " is-active" : ""}`}
                  style={{ "font-size": "var(--fs-xs)", padding: "2px 10px" }}
                  onClick={() => setPttMode(true)}
                >
                  PTT
                </button>
                <button
                  class={`pixel-btn${!pttMode() ? " is-active" : ""}`}
                  style={{ "font-size": "var(--fs-xs)", padding: "2px 10px" }}
                  onClick={() => setPttMode(false)}
                >
                  Voice Act.
                </button>
              </div>
            </div>
          </div>

          <Show when={pttMode()}>
            <div class="setting-group">
              <div class="setting-group-label">Push-to-Talk</div>

              <div class="setting-row is-horizontal">
                <label>PTT key</label>
                <button
                  class={`keybind-btn${listeningForKey() ? " is-listening" : ""}`}
                  onClick={listenForKey}
                  title="Click then press any key"
                >
                  {listeningForKey() ? "press key…" : keyDisplayLabel(pttKey())}
                </button>
              </div>

              <Show when={pttError()}>
                <div class="connect-form-error row gap-1">
                  <IconWarning size={9} />
                  {pttError()}
                </div>
              </Show>

              <div class="setting-row-hint">Works globally — even when Voxel is in the background.</div>
            </div>
          </Show>

          <Show when={!pttMode()}>
            <div class="setting-group">
              <div class="setting-group-label">Voice Activation</div>

              <div class="setting-row">
                <label>Sensitivity — {vadThreshold()}</label>
                <input
                  type="range" min={1} max={60} step={1}
                  value={vadThreshold()}
                  onInput={(e) => {
                    const v = parseInt(e.currentTarget.value);
                    setVadThreshold(v);
                    setThreshold(v);
                  }}
                />
                <span class="setting-row-hint">Lower = picks up more. Higher = less sensitive.</span>
              </div>

              <div class="setting-row">
                <label>Silence hold — {silenceHoldMs()}ms</label>
                <input
                  type="range" min={200} max={2000} step={100}
                  value={silenceHoldMs()}
                  onInput={(e) => {
                    const v = parseInt(e.currentTarget.value);
                    setSilenceHoldMs(v);
                    setSilenceHold(v);
                  }}
                />
                <span class="setting-row-hint">How long silence before mic cuts.</span>
              </div>
            </div>
          </Show>
        </Show>

        {/* ── About ── */}
        <Show when={settingsTab() === "general"}>
          <div class="setting-group">
            <div class="setting-group-label">Voxel</div>
            <div class="setting-row">
              <label>Version</label>
              <span class="text-mid">0.1.0</span>
            </div>
            <div class="setting-row">
              <label>License</label>
              <span class="text-mid">MIT</span>
            </div>
            <div class="setting-row">
              <label>Source</label>
              <a
                href="https://github.com/adamnfineco/voxel"
                target="_blank"
                style={{ color: "var(--c-accent)", "font-size": "var(--fs-xs)", "text-decoration": "none" }}
              >
                github.com/adamnfineco/voxel
              </a>
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-group-label">Architecture</div>
            <div class="text-dim text-xs" style={{ "line-height": "2" }}>
              Tauri v2 + SolidJS<br />
              WebRTC mesh — up to 14 peers<br />
              SQLite local state + WebSocket gossip<br />
              HMAC-signed changes + vector clock<br />
              Synthesised sound events (no external files)<br />
              Signal server: Rust + tokio
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-group-label">Signal Server</div>
            <div class="text-dim text-xs" style={{ "line-height": "2" }}>
              Run: <span style={{ color: "var(--c-text-mid)" }}>cargo run --release</span><br />
              Default port: <span style={{ color: "var(--c-text-mid)" }}>8080</span><br />
              Override: <span style={{ color: "var(--c-text-mid)" }}>BIND_ADDR=0.0.0.0:9090</span><br />
              Docker: <span style={{ color: "var(--c-text-mid)" }}>docker build -t voxel-signal ./signal</span>
            </div>
          </div>
        </Show>

      </div>
    </div>
  );
};

export default Settings;
