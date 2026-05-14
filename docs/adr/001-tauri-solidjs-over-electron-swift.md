# ADR-001: Tauri v2 + SolidJS Over Electron and Native Swift

**Date:** 2026-05-13  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

Need a desktop voice chat app with pixel art UI, low RAM, global hotkeys, system tray, and WebRTC audio. macOS primary target but cross-platform potential matters.

## Decision

Tauri v2 (Rust backend) + SolidJS (frontend).

## Alternatives Considered

**Electron + React**: Familiar ecosystem, but Electron bundles Chromium (~150MB RAM baseline). Mark explicitly wanted low RAM. Rejected.

**Native Swift/SwiftUI**: Best system integration on macOS, lowest RAM (~20MB). But pixel art UI in SwiftUI means fighting the framework — it's built for vector/retina, not pixelated rendering. No cross-platform path. Rejected for this project.

**Tauri v2 + SolidJS**: Uses system WKWebView (~40-60MB RAM). Rust backend for SQLite, hotkeys, tray. Web frontend is the natural home for pixel art (CSS image-rendering: pixelated, Canvas, bitmap fonts). SolidJS over React because: no virtual DOM, smaller bundle, true reactive signals, better for real-time UI updates like speaking indicators.

## Consequences

- Dependent on WKWebView's WebRTC implementation on macOS (Apple's pace for bug fixes)
- Rust compile times slower than Swift for backend changes
- Web-based pixel art rendering is excellent — CSS/Canvas are purpose-built for this
- Cross-platform (Windows, Linux) comes free later via Tauri
- RAM target achievable (~50-70MB with lightweight frontend)
