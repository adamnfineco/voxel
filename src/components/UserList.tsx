import { Component, For, Show, createSignal } from "solid-js";
import { IconSpeakerOff, IconUserMinus } from "./icons";
import type { PeerInfo } from "../store/appState";
import { identity, myRole } from "../store/appState";
import SpeakingIndicator from "./SpeakingIndicator";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { muteUser, unmuteUser, setRole } from "../store/servers";
import { setRemotePeerMuted } from "../audio/mesh";
import { updatePeer } from "../store/appState";
import { broadcastChange } from "../sync/gossip";

interface Props {
  peers: PeerInfo[];
  channelId: string;
  serverId: string;
  onKick?: (peerId: string) => void;
}

const UserList: Component<Props> = (props) => {
  const [ctxMenu, setCtxMenu] = createSignal<{
    x: number;
    y: number;
    peer: PeerInfo;
  } | null>(null);

  const handleRightClick = (e: MouseEvent, peer: PeerInfo) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, peer });
  };

  const buildMenuItems = (peer: PeerInfo): MenuItem[] => {
    const me = identity();
    const isMe = me?.id === peer.peerId;
    const isOwner = myRole() === "owner";
    const canManage = myRole() === "owner" || myRole() === "admin";
    const items: MenuItem[] = [];

    if (!isMe) {
      // Mute locally
      items.push({
        label: peer.muted ? "Unmute locally" : "Mute locally",
        icon: () => <IconSpeakerOff size={11} />,
        action: async () => {
          if (peer.muted) {
            await unmuteUser(props.serverId, peer.peerId);
            setRemotePeerMuted(peer.peerId, false);
            updatePeer(peer.peerId, { muted: false });
          } else {
            await muteUser(props.serverId, peer.peerId);
            setRemotePeerMuted(peer.peerId, true);
            updatePeer(peer.peerId, { muted: true });
          }
        },
      });

      // Admin management (owner only)
      if (isOwner) {
        items.push({ label: "", action: () => {}, separator: true });

        items.push({
          label: "Make Admin",
          action: async () => {
            if (!me) return;
            await setRole(props.serverId, peer.peerId, "admin", peer.displayName, me.id);
            await broadcastChange("role_set", JSON.stringify({
              server_id: props.serverId,
              peer_id: peer.peerId,
              role: "admin",
              display_name: peer.displayName,
              granted_by: me.id,
            }));
          },
        });
        items.push({
          label: "Remove Admin",
          action: async () => {
            if (!me) return;
            await setRole(props.serverId, peer.peerId, "member", peer.displayName, me.id);
            await broadcastChange("role_set", JSON.stringify({
              server_id: props.serverId,
              peer_id: peer.peerId,
              role: "member",
              display_name: peer.displayName,
              granted_by: me.id,
            }));
          },
        });
      }

      // Kick
      if (canManage) {
        items.push({ label: "", action: () => {}, separator: true });
        items.push({
          label: "Kick",
          icon: () => <IconUserMinus size={11} />,
          action: () => props.onKick?.(peer.peerId),
          danger: true,
        });
      }
    }

    return items;
  };

  const rowClass = (peer: PeerInfo) => {
    const parts = ["tree-user"];
    if (peer.speaking && !peer.muted) parts.push("is-speaking");
    if (peer.muted) parts.push("is-muted");
    if (peer.afk) parts.push("is-afk");
    return parts.join(" ");
  };

  return (
    <>
      <For each={props.peers}>
        {(peer) => (
          <div
            class={rowClass(peer)}
            onContextMenu={(e) => handleRightClick(e, peer)}
          >
            <SpeakingIndicator speaking={peer.speaking && !peer.muted} />
            <span class="user-name">{peer.displayName}</span>
            <span class="user-badges">
              <Show when={peer.muted}>
                <span class="user-badge muted">
                  <IconSpeakerOff size={9} />
                </span>
              </Show>
              <Show when={peer.afk}>
                <span class="user-badge afk">AFK</span>
              </Show>
            </span>
          </div>
        )}
      </For>

      <Show when={ctxMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={buildMenuItems(menu().peer)}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </Show>
    </>
  );
};

export default UserList;
