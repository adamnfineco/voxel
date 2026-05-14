import { Component, Show } from "solid-js";
import {
  IconMic,
  IconMicOff,
  IconSpeaker,
  IconSpeakerOff,
  IconGear,
  IconX,
  IconBroadcast,
} from "./icons";
import {
  micMuted, setMicMuted,
  soundMuted, setSoundMuted,
  pttMode, pttActive,
  localSpeaking,
  connected,
  activeChannel,
} from "../store/appState";
import { setMicMuted as setAudioMicMuted, setSoundMuted as setAudioSoundMuted } from "../audio/mesh";
import MicLevel from "./MicLevel";

interface Props {
  onDisconnect: () => void;
  onOpenSettings: () => void;
}

const MuteBar: Component<Props> = (props) => {
  const toggleMic = () => {
    const next = !micMuted();
    setMicMuted(next);
    setAudioMicMuted(next);
  };

  const toggleSound = () => {
    const next = !soundMuted();
    setSoundMuted(next);
    setAudioSoundMuted(next);
  };

  const statusText = () => {
    if (!connected()) return "disconnected";
    const ch = activeChannel();
    if (!ch) return "connected — no channel";
    return `#${ch.name}`;
  };

  const statusClass = () => {
    if (!connected()) return "mute-bar-status";
    if (localSpeaking() && !micMuted()) return "mute-bar-status is-speaking";
    return "mute-bar-status is-connected";
  };

  const isTalking = () => pttActive() || (!pttMode() && localSpeaking());

  return (
    <div class="mute-bar">
      {/* Mic mute toggle */}
      <button
        class={`pixel-btn pixel-btn-icon${micMuted() ? " danger" : " is-active"}`}
        onClick={toggleMic}
        title={micMuted() ? "Unmute mic (M)" : "Mute mic (M)"}
      >
        <Show
          when={!micMuted()}
          fallback={<IconMicOff size={14} />}
        >
          <IconMic size={14} />
        </Show>
      </button>

      {/* Sound mute toggle */}
      <button
        class={`pixel-btn pixel-btn-icon${soundMuted() ? " danger" : " is-active"}`}
        onClick={toggleSound}
        title={soundMuted() ? "Unmute sound (S)" : "Mute sound (S)"}
      >
        <Show
          when={!soundMuted()}
          fallback={<IconSpeakerOff size={14} />}
        >
          <IconSpeaker size={14} />
        </Show>
      </button>

      {/* PTT / TX pill */}
      <Show when={connected()}>
        <div class={`ptt-pill${isTalking() ? " is-active" : ""}`}>
          <div class="ptt-dot" />
          <IconBroadcast size={10} />
          {pttMode() ? "PTT" : "VAD"}
        </div>
      </Show>

      {/* Status */}
      <span class={statusClass()}>
        {statusText()}
      </span>

      {/* Mic level meter */}
      <Show when={connected() && !micMuted()}>
        <MicLevel />
      </Show>

      {/* Settings */}
      <button
        class="pixel-btn pixel-btn-icon"
        onClick={props.onOpenSettings}
        title="Settings"
      >
        <IconGear size={14} />
      </button>

      {/* Disconnect */}
      <Show when={connected()}>
        <button
          class="pixel-btn pixel-btn-icon danger"
          onClick={props.onDisconnect}
          title="Disconnect"
        >
          <IconX size={14} />
        </button>
      </Show>
    </div>
  );
};

export default MuteBar;
