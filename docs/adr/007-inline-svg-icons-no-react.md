# ADR-007: Inline SVG Icons — No React Icon Libraries in Solid

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Solin

## Context

Initial implementation used `@phosphor-icons/react` for UI icons. This caused a fatal runtime crash: Solid tried to invoke React `forwardRef` objects as components, producing `TypeError: e is not a function`.

The black screen on launch was caused entirely by this React/Solid incompatibility.

## Decision

All icons are local inline SVG components in `src/components/icons.tsx`. No external icon library. Each icon is a pure Solid component returning an `<svg>` element with configurable size, color, and stroke.

## Alternatives Considered

**@phosphor-icons/react**: Crashed the app. React components are not Solid components. Rejected.

**solid-phosphor-icons or similar Solid-native package**: Exists but adds a dependency for something that's ~30 small SVGs. Rejected — the inline approach is zero-dependency and fully controlled.

**Icon font (e.g. Font Awesome)**: Pixel art aesthetic wants sharp, small icons — not font-rendered glyphs. Rejected on taste.

## Consequences

- Zero external dependencies for icons
- Full control over every icon's size, weight, and color
- ~150 lines of code for all icons used in the app
- Any new icon is just another function export — no npm install needed
