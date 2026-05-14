import type { JSX } from "solid-js";

type IconProps = {
  size?: number;
  class?: string;
  color?: string;
  strokeWidth?: number;
};

const base = (size = 12): JSX.CSSProperties => ({
  width: `${size}px`,
  height: `${size}px`,
  display: "inline-block",
  "vertical-align": "middle",
  color: "currentColor",
});

function Svg(props: IconProps & { viewBox?: string; children: JSX.Element }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={props.viewBox ?? "0 0 24 24"}
      fill="none"
      stroke={props.color ?? "currentColor"}
      stroke-width={props.strokeWidth ?? 2}
      stroke-linecap="square"
      stroke-linejoin="miter"
      style={base(props.size)}
      class={props.class}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return <Svg {...props}><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/><rect x="8" y="8" width="8" height="8"/></Svg>;
}

export function IconX(props: IconProps) {
  return <Svg {...props}><path d="M5 5l14 14M19 5 5 19"/></Svg>;
}

export function IconMic(props: IconProps) {
  return <Svg {...props}><rect x="9" y="4" width="6" height="10"/><path d="M7 11v1a5 5 0 0 0 10 0v-1M12 17v3M9 20h6"/></Svg>;
}

export function IconMicOff(props: IconProps) {
  return <Svg {...props}><rect x="9" y="4" width="6" height="10"/><path d="M7 11v1a5 5 0 0 0 10 0v-1M12 17v3M9 20h6M4 4l16 16"/></Svg>;
}

export function IconSpeaker(props: IconProps) {
  return <Svg {...props}><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M17 9c1.5 1 1.5 5 0 6M19 7c3 2 3 8 0 10"/></Svg>;
}

export function IconSpeakerOff(props: IconProps) {
  return <Svg {...props}><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9l4 6M20 9l-4 6"/></Svg>;
}

export function IconBroadcast(props: IconProps) {
  return <Svg {...props}><path d="M12 12h.01M8 12a4 4 0 0 1 8 0M5 12a7 7 0 0 1 14 0"/></Svg>;
}

export function IconArrowLeft(props: IconProps) {
  return <Svg {...props}><path d="M19 12H5M11 6l-6 6 6 6"/></Svg>;
}

export function IconArrowRight(props: IconProps) {
  return <Svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></Svg>;
}

export function IconWarning(props: IconProps) {
  return <Svg {...props}><path d="M12 4l8 16H4z"/><path d="M12 9v4M12 17h.01"/></Svg>;
}

export function IconInfo(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></Svg>;
}

export function IconKeyboard(props: IconProps) {
  return <Svg {...props}><rect x="3" y="6" width="18" height="12"/><path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h1M6 14h8M16 14h3"/></Svg>;
}

export function IconAudio(props: IconProps) {
  return <Svg {...props}><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M17 9c1.5 1 1.5 5 0 6"/></Svg>;
}

export function IconHash(props: IconProps) {
  return <Svg {...props}><path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16"/></Svg>;
}

export function IconQueue(props: IconProps) {
  return <Svg {...props}><path d="M5 7h14M5 12h10M5 17h14"/></Svg>;
}

export function IconMoon(props: IconProps) {
  return <Svg {...props}><path d="M18 14a7 7 0 1 1-8-10 8 8 0 0 0 8 10z"/></Svg>;
}

export function IconLock(props: IconProps) {
  return <Svg {...props}><rect x="6" y="11" width="12" height="9"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></Svg>;
}

export function IconPlus(props: IconProps) {
  return <Svg {...props}><path d="M12 5v14M5 12h14"/></Svg>;
}

export function IconPencil(props: IconProps) {
  return <Svg {...props}><path d="M4 20l4-1 9-9-3-3-9 9-1 4zM13 6l3 3"/></Svg>;
}

export function IconTrash(props: IconProps) {
  return <Svg {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/></Svg>;
}

export function IconFolder(props: IconProps) {
  return <Svg {...props}><path d="M3 7h6l2 2h10v10H3z"/></Svg>;
}

export function IconUserMinus(props: IconProps) {
  return <Svg {...props}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M17 12h4"/></Svg>;
}

export function IconWifi(props: IconProps) {
  return <Svg {...props}><path d="M3 9a14 14 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 15a6 6 0 0 1 6 0M12 19h.01"/></Svg>;
}

export function IconSpinner(props: IconProps) {
  return <Svg {...props}><path d="M12 3v3M19 12h-3M12 21v-3M5 12h3M17.7 6.3l-2.1 2.1M17.7 17.7l-2.1-2.1M6.3 17.7l2.1-2.1M6.3 6.3l2.1 2.1"/></Svg>;
}
