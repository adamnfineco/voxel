# ADR-006: Tray + Dock App on macOS

**Date:** 2026-05-14  
**Status:** Accepted  
**Supersedes:** Earlier approach using ActivationPolicy::Accessory  
**Author:** Mark + Solin

## Context

Voice chat apps need to run persistently. The question is how to present the app on macOS — Dock-only, tray-only, or both.

Initial implementation used `ActivationPolicy::Accessory` which hid the app from both Dock and Cmd+Tab. Mark's feedback: "Why can't I Cmd+Tab to it?"

## Decision

Voxel runs as a normal macOS app (Regular activation policy) with an additional tray icon:

- **Dock icon**: present, normal macOS behavior
- **Cmd+Tab**: works normally when window is open
- **Tray icon**: always present in the menu bar for quick show/hide
- **Close button**: hides window to tray instead of quitting
- **Right-click tray**: Show / Quit menu

The app is always running. The window is the UI surface you toggle on and off.

## Alternatives Considered

**Accessory (tray-only)**: Hides from Dock and Cmd+Tab entirely. Felt broken — couldn't switch to the app normally. Rejected after testing.

**Dock-only (no tray)**: Standard macOS app behavior. But voice chat should be persistent and quick to toggle without hunting through windows. Rejected — tray adds real value.

**Both with dynamic policy switching**: Switch to Accessory when window hidden, Regular when shown. Technically correct but introduced edge cases with macOS activation policy timing. Rejected in favor of just staying Regular.

## Consequences

- App always visible in Dock when running
- Cmd+Tab works as expected
- Tray provides quick show/hide toggle
- Closing the window doesn't quit — app persists for voice connections
- Uses slightly more visual space (Dock + tray) but matches user mental model
