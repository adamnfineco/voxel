import { Component } from "solid-js";

interface Props {
  speaking: boolean;
  size?: number;
}

const SpeakingIndicator: Component<Props> = (props) => {
  return (
    <div
      class={`speaking-dot${props.speaking ? " is-speaking" : ""}`}
      style={props.size ? { width: `${props.size}px`, height: `${props.size}px` } : {}}
      title={props.speaking ? "Speaking" : "Silent"}
    />
  );
};

export default SpeakingIndicator;
