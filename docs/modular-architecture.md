# Modular Architecture

## Target split

Sensagotchi is organized around three layers:

1. `physiology-engine`
   Pure state simulation. Initializes the monster, lists actions, applies actions, and advances time.
2. `expressive-engine`
   Maps physiological state into motion, visual cues, and expression parameters.
3. `web-app`
   Owns DOM, i18n, audio, backgrounds, and interaction flow.

## Current boundaries

### Physiology engine

The main browser app now consumes the physiology layer through
[`src/internal-logic/engine.js`](../src/internal-logic/engine.js), not by
calling `Human`, `apply_event`, or `apply_decay` directly.

Public API exposed in this wrapper:

- `createPhysiologyEngine({ presetId })`
- `engine.getState()`
- `engine.listActions()`
- `engine.listActionsByCategory()`
- `engine.getAction(id)`
- `engine.canApplyAction(id)`
- `engine.applyAction(id)`
- `engine.step(hours)`
- `engine.reset({ presetId })`

This is the main reusable boundary for non-web consumers.

### Expressive engine

[`src/expressive-engine.js`](../src/expressive-engine.js) is the reusable,
state-to-expression layer. It is already mostly pure and should be treated as
the primary expressive module.

[`src/monster-renderer-p5.js`](../src/monster-renderer-p5.js) is the browser/p5 renderer. It now exposes
an explicit renderer API both as module exports and as browser globals:

- `createMonsterRendererP5()`
- `monsterRenderer`
- `window.createMonsterRendererP5()`
- `renderer.setState(state)`
- `renderer.setExpression(expressionParams)`
- `renderer.getState()`
- `renderer.destroy()`

The current web app still uses the legacy compatibility shim
`window.updateMonsterFromApp`, but the intended boundary is the renderer object.

### Web app

[`src/main.js`](../src/main.js) now acts more clearly as the integration layer:

- asks the physiology engine for state/actions
- translates those actions through `i18n`
- sends state into the expressive layer / renderer
- owns UI-specific config like category metadata and backgrounds

## Remaining decoupling work

### Physiology engine

Still to do:

- replace text notifications with semantic codes + payloads
- remove UI-facing descriptions/reasons from raw event definitions

### Expressive engine

Still to do:

- keep `expressive-engine` importable as a standalone module and avoid globals in consumers
- allow alternate renderers besides p5

## Practical rule

If a change affects:

- simulation rules: put it in `src/internal-logic`
- expression mapping: put it in `src/expressive-engine.js`
- rendering implementation: put it in `src/monster-renderer-p5.js`
- UI copy/layout/interaction: put it in `src/main.js`, `src/i18n.js`, HTML/CSS
