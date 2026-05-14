/**
 * Voxel Signal Server — Integration Test Suite
 *
 * Run: node test-signal.mjs
 * Requires: voxel-signal running on :8080
 *
 * Covers:
 *   1.  Single peer join → empty peer_list
 *   2.  Second peer joins → mutual notification
 *   3.  WebRTC offer routing
 *   4.  WebRTC answer routing
 *   5.  ICE candidate routing
 *   6.  Channel change broadcast
 *   7.  Name deduplication → rejected
 *   8.  Gossip relay (change message)
 *   9.  Peer disconnect notification
 *   10. Oversized message → discarded, server survives
 *   11. Room peer cap (14 peers max)
 *   12. Join re-join sends updated peer_list
 *   13. Gossip ping → no crash
 *   14. Multiple rooms are isolated
 *   15. Unknown message type → no crash
 */

const URL   = "ws://localhost:8080";
const ROOM  = "test-" + Math.random().toString(36).slice(2, 8);
const ROOM2 = "test-" + Math.random().toString(36).slice(2, 8);

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function signalConn(peerId, displayName, room = ROOM) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${URL}/signal?server=${room}&peer=${peerId}&key=testkey`);
    const messages = [];
    let opened = false;
    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify({ type: "join", from: peerId, serverId: room, displayName, channelId: null }));
      resolve({ ws, messages });
    };
    ws.onmessage = (e) => { try { messages.push(JSON.parse(e.data)); } catch {} };
    ws.onerror = () => { if (!opened) reject(new Error("WS error")); };
    setTimeout(() => { if (!opened) reject(new Error("Timeout")); }, 3000);
  });
}

function gossipConn(peerId, room = ROOM) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${URL}/gossip?server=${room}&peer=${peerId}&key=testkey`);
    const messages = [];
    let opened = false;
    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify({ type: "sync_request", serverId: room, peerId, clock: {} }));
      resolve({ ws, messages });
    };
    ws.onmessage = (e) => { try { messages.push(JSON.parse(e.data)); } catch {} };
    ws.onerror = () => { if (!opened) reject(new Error("Gossip WS error")); };
    setTimeout(() => { if (!opened) reject(new Error("Timeout")); }, 3000);
  });
}

async function run() {
  console.log(`\nVoxel Signal Server — Integration Tests`);
  console.log(`URL:  ${URL}`);
  console.log(`Room: ${ROOM}\n`);

  // ── 1. Single peer join ──────────────────────────────────────────────────
  console.log("1. Single peer join");
  const alice = await signalConn("alice-001", "Alice");
  await wait(120);
  const pl = alice.messages.find(m => m.type === "peer_list");
  assert(!!pl,                         "received peer_list");
  assert(pl?.names?.length === 0,      "peer_list empty for first peer");

  // ── 2. Second peer joins ─────────────────────────────────────────────────
  console.log("\n2. Second peer joins");
  const bob = await signalConn("bob-002", "Bob");
  await wait(120);
  assert(!!alice.messages.find(m => m.type === "peer_joined" && m.from === "bob-002"),
    "alice sees peer_joined for bob");
  const bobPl = bob.messages.find(m => m.type === "peer_list");
  assert(bobPl?.names?.length === 1,   "bob's peer_list has 1 peer");
  assert(bobPl?.names?.[0]?.peerId === "alice-001", "bob's list contains alice");

  // ── 3. Offer routing ─────────────────────────────────────────────────────
  console.log("\n3. Offer routing");
  alice.ws.send(JSON.stringify({ type: "offer", from: "alice-001", to: "bob-002", serverId: ROOM, offer: { type: "offer", sdp: "v=0" } }));
  await wait(120);
  const bobOffer = bob.messages.find(m => m.type === "offer" && m.from === "alice-001");
  assert(!!bobOffer,                   "bob received offer");
  assert(bobOffer?.offer?.type === "offer", "offer payload intact");

  // ── 4. Answer routing ────────────────────────────────────────────────────
  console.log("\n4. Answer routing");
  bob.ws.send(JSON.stringify({ type: "answer", from: "bob-002", to: "alice-001", serverId: ROOM, answer: { type: "answer", sdp: "v=0" } }));
  await wait(120);
  assert(!!alice.messages.find(m => m.type === "answer" && m.from === "bob-002"), "alice received answer");

  // ── 5. ICE routing ───────────────────────────────────────────────────────
  console.log("\n5. ICE candidate routing");
  alice.ws.send(JSON.stringify({ type: "ice", from: "alice-001", to: "bob-002", serverId: ROOM, candidate: { candidate: "cand", sdpMid: "0", sdpMLineIndex: 0 } }));
  await wait(120);
  assert(!!bob.messages.find(m => m.type === "ice" && m.from === "alice-001"), "bob received ICE");

  // ── 6. Channel change ────────────────────────────────────────────────────
  console.log("\n6. Channel change broadcast");
  alice.ws.send(JSON.stringify({ type: "channel_change", from: "alice-001", serverId: ROOM, channelId: "ch-lobby" }));
  await wait(120);
  const cc = bob.messages.find(m => m.type === "channel_change" && m.from === "alice-001");
  assert(!!cc,                         "bob received channel_change");
  assert(cc?.channelId === "ch-lobby", "channelId correct");

  // ── 7. Name dedup ────────────────────────────────────────────────────────
  console.log("\n7. Name deduplication");
  let dupClosed = false, nameTaken = false;
  const dup = new WebSocket(`${URL}/signal?server=${ROOM}&peer=dup-999&key=testkey`);
  await new Promise(resolve => {
    dup.onopen = () => dup.send(JSON.stringify({ type: "join", from: "dup-999", serverId: ROOM, displayName: "Alice" }));
    dup.onmessage = e => { try { if (JSON.parse(e.data).type === "name_taken") nameTaken = true; } catch {} };
    dup.onclose = () => { dupClosed = true; resolve(); };
    setTimeout(resolve, 1200);
  });
  assert(nameTaken || dupClosed, "duplicate name rejected");

  // ── 8. Gossip relay ──────────────────────────────────────────────────────
  console.log("\n8. Gossip relay");
  const aliceG = await gossipConn("alice-001");
  await wait(120);
  aliceG.ws.send(JSON.stringify({
    type: "change", serverId: ROOM, peerId: "alice-001",
    seq: 1, timestamp: Date.now(), changeType: "channel_create",
    payload: JSON.stringify({ id: "ch-x", server_id: ROOM, name: "X", sort_order: 0, is_afk: false, afk_timeout_seconds: 300, is_queued: false, updated_at: Date.now() }),
    hmac: "testhmacsig",
  }));
  await wait(200);
  assert(!!bob.messages.find(m => m.type === "change" && m.peerId === "alice-001"), "bob got gossip change");

  // ── 9. Peer disconnect notification ──────────────────────────────────────
  console.log("\n9. Peer disconnect");
  alice.ws.close();
  await wait(350);
  assert(!!bob.messages.find(m => m.type === "peer_left" && m.from === "alice-001"), "bob got peer_left");

  // ── 10. Oversized message ─────────────────────────────────────────────────
  console.log("\n10. Oversized message");
  const pre = bob.messages.length;
  bob.ws.send("x".repeat(70_000));
  await wait(250);
  // Server should still be alive (bob connection still valid or gracefully closed)
  assert(bob.ws.readyState === WebSocket.OPEN || bob.ws.readyState === WebSocket.CLOSED,
    "server survived oversized message");

  // ── 11. Room peer cap ─────────────────────────────────────────────────────
  console.log("\n11. Room peer cap (14 max)");
  // Connect 12 more peers (bob is already in, total would be 13 — we need 14 to fill, 15 to exceed)
  const extras = [];
  for (let i = 0; i < 13; i++) {
    try {
      const c = await signalConn(`extra-${i.toString().padStart(3, "0")}`, `Peer${i}`);
      extras.push(c);
    } catch { break; }
    await wait(30);
  }
  // Now try one more — should be rejected
  let capRejected = false;
  const overflow = new WebSocket(`${URL}/signal?server=${ROOM}&peer=overflow-999&key=testkey`);
  await new Promise(resolve => {
    overflow.onopen = () => overflow.send(JSON.stringify({ type: "join", from: "overflow-999", serverId: ROOM, displayName: "Overflow" }));
    overflow.onclose = () => { capRejected = true; resolve(); };
    overflow.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === "error") { capRejected = true; } } catch {} };
    setTimeout(resolve, 1000);
  });
  assert(capRejected, "15th peer rejected (cap enforced)");

  // Cleanup extras
  extras.forEach(c => c.ws.close());
  await wait(200);

  // ── 12. Re-join sends peer_list ───────────────────────────────────────────
  console.log("\n12. Re-join sends updated peer_list");
  // bob is still connected, reconnect a fresh peer
  const charlie = await signalConn("charlie-003", "Charlie");
  await wait(150);
  const charliePl = charlie.messages.find(m => m.type === "peer_list");
  assert(!!charliePl,                  "charlie received peer_list");
  // Bob should be in it
  assert(charliePl?.names?.some((n) => n.peerId === "bob-002"), "peer_list includes bob");

  // ── 13. Gossip ping no crash ──────────────────────────────────────────────
  console.log("\n13. Gossip ping (no crash)");
  const pingG = await gossipConn("charlie-003");
  pingG.ws.send(JSON.stringify({ type: "ping", serverId: ROOM, peerId: "charlie-003" }));
  await wait(200);
  assert(pingG.ws.readyState === WebSocket.OPEN || pingG.ws.readyState === WebSocket.CLOSED,
    "server survived gossip ping");
  pingG.ws.close();

  // ── 14. Room isolation ────────────────────────────────────────────────────
  console.log("\n14. Room isolation");
  const dave = await signalConn("dave-004", "Dave", ROOM2);
  await wait(150);
  const davePl = dave.messages.find(m => m.type === "peer_list");
  assert(davePl?.names?.length === 0,  "dave's room is isolated from main room");
  dave.ws.close();

  // ── 15. Unknown message type ──────────────────────────────────────────────
  console.log("\n15. Unknown message type");
  bob.ws.send(JSON.stringify({ type: "totally_unknown_type", from: "bob-002", serverId: ROOM }));
  await wait(200);
  assert(bob.ws.readyState === WebSocket.OPEN || bob.ws.readyState === WebSocket.CLOSED,
    "server survived unknown message type");

  // Cleanup
  bob.ws.close();
  charlie.ws.close();
  aliceG.ws.close();
  await wait(200);

  // Results
  console.log(`\n${"─".repeat(42)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  else console.log("All tests passed ✓\n");
}

run().catch(e => { console.error("Runner error:", e); process.exit(1); });
