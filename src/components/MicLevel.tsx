import { Component } from "solid-js";
import { IconMic, IconMicOff } from "./icons";
import { micLevel, micMuted } from "../store/appState";

const MicLevel: Component = () => {
  const level = () => micLevel();
  const pct = () => Math.round(level() * 100);

  const fillClass = () => {
    if (level() > 0.85) return "mic-meter-fill is-clip";
    if (level() > 0.55) return "mic-meter-fill is-hot";
    return "mic-meter-fill";
  };

  // Use transform: scaleX for hardware acceleration — not width
  const fillStyle = () => ({
    transform: `scaleX(${level()})`,
    width: "100%",
  });

  return (
    <div class="mic-meter" title={`Mic: ${pct()}%`}>
      {micMuted()
        ? <IconMicOff size={10} color="var(--c-muted)" />
        : <IconMic size={10} color="var(--c-text-dim)" />
      }
      <div class="mic-meter-track">
        <div class={fillClass()} style={fillStyle()} />
      </div>
    </div>
  );
};

export default MicLevel;
