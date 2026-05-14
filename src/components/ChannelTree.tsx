import { Component, For, Show, createSignal } from "solid-js";
import {
  IconHash,
  IconQueue,
  IconMoon,
  IconLock,
  IconPlus,
  IconArrowRight,
  IconPencil,
  IconTrash,
  IconFolder,
} from "./icons";
import type { Channel } from "../store/servers";
import type { PeerInfo } from "../store/appState";
import { activeChannel, myRole } from "../store/appState";
import UserList from "./UserList";
import ContextMenu, { type MenuItem } from "./ContextMenu";

interface Props {
  channels: Channel[];
  peers: Map<string, PeerInfo>;
  serverId: string;
  serverName: string;
  onJoinChannel: (channel: Channel) => void;
  onCreateChannel: (parentId?: string) => void;
  onDeleteChannel: (channel: Channel) => void;
  onEditChannel: (channel: Channel) => void;
  onKickUser: (peerId: string) => void;
}

const ChannelTree: Component<Props> = (props) => {
  const [ctxChannel, setCtxChannel] = createSignal<{
    x: number;
    y: number;
    channel: Channel;
  } | null>(null);

  const topLevel = () =>
    props.channels
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const subChannels = (parentId: string) =>
    props.channels
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const usersIn = (channelId: string): PeerInfo[] =>
    Array.from(props.peers.values()).filter((p) => p.channelId === channelId);

  const totalUsersIn = (channelId: string): number => {
    let n = usersIn(channelId).length;
    subChannels(channelId).forEach((s) => { n += usersIn(s.id).length; });
    return n;
  };

  const canManage = () => myRole() === "owner" || myRole() === "admin";

  const handleRightClick = (e: MouseEvent, channel: Channel) => {
    e.preventDefault();
    setCtxChannel({ x: e.clientX, y: e.clientY, channel });
  };

  const channelMenu = (channel: Channel): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: "Join",
        icon: () => <IconArrowRight size={13} />,
        action: () => props.onJoinChannel(channel),
      },
    ];

    if (canManage()) {
      items.push({ label: "", action: () => {}, separator: true });
      items.push({
        label: "New sub-channel",
        icon: () => <IconFolder size={13} />,
        action: () => props.onCreateChannel(channel.id),
      });
      items.push({
        label: "Edit",
        icon: () => <IconPencil size={13} />,
        action: () => props.onEditChannel(channel),
      });
      items.push({ label: "", action: () => {}, separator: true });
      items.push({
        label: "Delete channel",
        icon: () => <IconTrash size={13} />,
        action: () => props.onDeleteChannel(channel),
        danger: true,
      });
    }

    return items;
  };

  const ChannelIcon = (channel: Channel) => {
    if (channel.is_afk) return <IconMoon size={13} />;
    if (channel.is_queued) return <IconQueue size={13} />;
    if (channel.password_hash) return <IconLock size={13} />;
    return <IconHash size={13} />;
  };

  const renderChannel = (channel: Channel, depth = 0) => {
    const isActive = () => activeChannel()?.id === channel.id;
    const users = () => usersIn(channel.id);
    const subs = () => subChannels(channel.id);
    const userCount = () => totalUsersIn(channel.id);

    const cls = () => {
      const parts = ["tree-channel"];
      if (isActive()) parts.push("is-active");
      if (channel.is_afk) parts.push("is-afk");
      if (depth > 0) parts.push("is-sub");
      return parts.join(" ");
    };

    return (
      <div>
        {/* Channel row */}
        <div
          class={cls()}
          onClick={() => props.onJoinChannel(channel)}
          onContextMenu={(e) => handleRightClick(e, channel)}
        >
          <span class="ch-icon">
            {ChannelIcon(channel)}
          </span>

          <span class="ch-name truncate">{channel.name}</span>

          <span class="ch-badge">
            {/* Tags */}
            <Show when={channel.is_afk}>
              <span class="ch-tag afk">AFK</span>
            </Show>
            <Show when={channel.is_queued && !channel.is_afk}>
              <span class="ch-tag queued">Q</span>
            </Show>
            <Show when={channel.max_users}>
              <span class="ch-tag locked">{channel.max_users}</span>
            </Show>

            {/* User count */}
            <Show when={userCount() > 0}>
              <span class="ch-count">{userCount()}</span>
            </Show>
          </span>
        </div>

        {/* Users in channel */}
        <Show when={users().length > 0}>
          <UserList
            peers={users()}
            channelId={channel.id}
            serverId={props.serverId}
            onKick={props.onKickUser}
          />
        </Show>

        {/* Sub-channels */}
        <For each={subs()}>
          {(sub) => renderChannel(sub, depth + 1)}
        </For>
      </div>
    );
  };

  return (
    <div class="channel-tree">
      {/* Server label */}
      <div class="tree-server-name">
        <IconHash size={11} />
        {props.serverName}
      </div>

      {/* Empty state */}
      <Show when={topLevel().length === 0}>
        <div style={{
          padding: "20px 12px",
          "text-align": "center",
          "font-size": "var(--fs-xs)",
          color: "var(--c-text-dim)",
          "line-height": "2",
        }}>
          No channels yet.
          <Show when={canManage()}>
            <br />Right-click or use the button below.
          </Show>
        </div>
      </Show>

      {/* Channel list */}
      <For each={topLevel()}>
        {(channel) => renderChannel(channel)}
      </For>

      {/* New channel button — only for admins/owners */}
      <Show when={canManage()}>
        <div style={{
          padding: "5px 8px",
          "border-top": "1px solid var(--c-border)",
          "margin-top": "4px",
        }}>
          <button
            class="pixel-btn"
            style={{ width: "100%", "font-size": "var(--fs-xs)", gap: "4px" }}
            onClick={() => props.onCreateChannel()}
          >
            <IconPlus size={12} />
            New Channel
          </button>
        </div>
      </Show>

      {/* Context menu */}
      <Show when={ctxChannel()}>
        {(ctx) => (
          <ContextMenu
            x={ctx().x}
            y={ctx().y}
            items={channelMenu(ctx().channel)}
            onClose={() => setCtxChannel(null)}
          />
        )}
      </Show>
    </div>
  );
};

export default ChannelTree;
