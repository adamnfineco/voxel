# Self-hosting voxel-signal

`voxel-signal` is the rendezvous server — the only centralized piece of Voxel's architecture. It handles peer discovery and ICE candidate exchange. It never touches audio. The source is ~250 lines of Rust.

You can run your own instance and point the app at it, or use the public default at `wss://voxel.damnfine.xyz`.

---

## Requirements

- Linux server with a public IP
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Apache or nginx with WebSocket proxy support
- A domain + TLS cert (Let's Encrypt works)

---

## Build

```bash
git clone https://github.com/adamnfineco/voxel
cd voxel
cargo build --release -p voxel-signal
```

Binary at `target/release/voxel-signal`.

---

## Deploy (systemd)

1. **Copy the binary** to your server:

```bash
scp target/release/voxel-signal user@yourserver:/home/voxel/bin/voxel-signal
chmod +x /home/voxel/bin/voxel-signal
```

2. **Install the systemd unit:**

```bash
sudo cp signal/deploy/voxel-signal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable voxel-signal
sudo systemctl start voxel-signal
```

Check it's running:
```bash
sudo systemctl status voxel-signal
journalctl -u voxel-signal -f
```

The server binds to `127.0.0.1:8765` by default. Override with `BIND_ADDR`:
```
Environment=BIND_ADDR=127.0.0.1:9000
```

---

## Apache WebSocket proxy

Enable required modules:
```bash
sudo a2enmod proxy proxy_wstunnel
sudo systemctl reload apache2
```

Add the directives from `signal/deploy/apache-vhost.conf` inside your `<VirtualHost *:443>` block. In Virtualmin: **Server Configuration → Edit Directives**.

---

## Point the app at your server

Change `DEFAULT_SIGNAL_URL` in `src/runtime/config.ts`:

```typescript
export const DEFAULT_SIGNAL_URL = "wss://your-domain.example.com";
```

Then rebuild the app.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BIND_ADDR` | `0.0.0.0:8080` | Address to bind the WebSocket server |
| `RUST_LOG` | `info` | Log level (`debug`, `info`, `warn`, `error`) |

---

## Docker

A `Dockerfile` is included in `signal/`:

```bash
cd signal
docker build -t voxel-signal .
docker run -p 8080:8080 -e RUST_LOG=info voxel-signal
```
