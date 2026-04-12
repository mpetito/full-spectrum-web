# Plan: UI Controls Improvements

**Spec**: [specs/009-ui-controls/spec.md](specs/009-ui-controls/spec.md) | **Date**: 2025-04-12

## Summary

Seven UI improvements grouped into four implementation phases: defaults & 3MF fixes, palette editor UX (preview bar, selectors, inputs), auto-apply toggle, and input preview verification. Changes span `src/lib/config.ts`, `src/lib/threemf.ts`, `src/state/AppContext.tsx`, `src/hooks/useProcessing.ts`, and five component files.

## Architecture Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Forgiving inputs | Local `useState<string>` with validation on change | Decouples display text from config value; border turns red when invalid |
| Bresenham preview | `buildBresenhamCSS` calls `buildBresenhamLayerMap` (100 layers) | Mirrors `TransitionEditor.buildPreviewCSS` pattern exactly |
| Auto-apply state | `AppState.autoApply: boolean` + `TOGGLE_AUTO_APPLY` / `MANUAL_APPLY` actions | Keeps state in reducer; `useProcessing` reads from context |
| Stop colour source | Pass `filamentColors` as prop to all editors | Avoids importing hardcoded constant; reactive to state changes |

## Implementation Phases

### Phase 1: Defaults & Config Fixes (F1, F5)

1. [x] In `src/components/PaletteMapper.tsx` → `defaultPalette('transition')`: change `maxCycleLength: 2` to `maxCycleLength: 1`
2. [x] In `src/state/AppContext.tsx` → `UPLOAD_SUCCESS` reducer case: if `meshData.layerHeight` is defined, merge it into the config via `layerHeightMm`
3. [x] Verify `src/lib/threemf.ts` → `configXml()` writes `layer_height` and `initial_layer_height` correctly (already implemented — just validate with a unit test)
4. [x] Verification: Upload a 3MF with 0.10 mm layer height → config slider reflects 0.10 mm; output 3MF has plate overrides

### Phase 2: Palette Editor UX (F2, F3, F4)

5. [x] **Bresenham preview bar** — Rewrite `buildBresenhamCSS` in `src/components/BresenhamEditor.tsx`:
   - Import `buildBresenhamLayerMap` from `../lib/palette`
   - Accept `filamentColors: string[]` parameter
   - Generate ~100 layers of discrete dithered bands
   - Build CSS gradient with hard colour stops (same technique as `TransitionEditor.buildPreviewCSS`)

6. [x] **Stop colour selectors** — In `BresenhamEditor`, `TransitionEditor`, `CyclicEditor`:
   - Add `filamentColors: string[]` prop (passed from `PaletteMapper` which already has it)
   - Replace `FILAMENT_COLORS[n]` references with `filamentColors[n]`
   - Add `style={{ backgroundColor: filamentColors[n] }}` to each `<option>` element
   - Remove `import { FILAMENT_COLORS }` where no longer needed

7. [x] **Forgiving text inputs** — Create a `NumericInput` helper component (or inline pattern) in affected editors:
   - Use local `useState<string>` initialised from prop value
   - On `onChange`: update local string; if valid number in range, dispatch to parent
   - Show `border-red-500` when local string is not a valid number or out of range
   - On `onBlur`: if still invalid, revert to last valid value
   - Apply to: Bresenham stop `t`, Transition stop `t`, Transition width value, maxCycleLength

8. [x] **TransitionEditor preview** — Update `buildPreviewCSS` to use `filamentColors` parameter instead of `FILAMENT_COLORS`

9. [x] **PaletteMapper** — Pass `filamentColors` prop to all three editors

10. [x] Verification: Change filament colours → stop selectors and preview bars update immediately; type `0.` into a stop field → red border, no crash

### Phase 3: Auto-Apply Toggle (F6)

11. [x] In `src/state/AppContext.tsx`:
    - Add `autoApply: boolean` to `AppState` (default `true`)
    - Add actions: `TOGGLE_AUTO_APPLY` (toggles boolean), `MANUAL_APPLY` (increments a manual-apply counter used to trigger processing)
    - Reducer: `TOGGLE_AUTO_APPLY` flips `autoApply`; `MANUAL_APPLY` increments `manualApplyCount` so the hook can detect a one-shot manual trigger

12. [x] In `src/hooks/useProcessing.ts`:
    - Read `autoApply` from state
    - If `autoApply` is false, skip the debounced processing on config changes
    - Add a separate `useEffect` that listens for `manualApplyCount` changes from the reducer to trigger a single processing run

13. [x] In `src/components/GlobalSettings.tsx`:
    - Add an "Auto Apply" toggle switch after the layer height slider
    - When off, show an "Apply" button (prominent, `bg-indigo-600 text-white`, disabled while `status === 'processing'`)
    - Dispatch `TOGGLE_AUTO_APPLY` on toggle change
    - Dispatch `MANUAL_APPLY` on Apply button click

14. [x] Add i18n keys: `globalSettings.autoApply`, `globalSettings.applyButton`

15. [x] Verification: Toggle off auto-apply → change palette → no processing → click Apply → processing runs → output updates

### Phase 4: Input Preview & Polish (F7)

16. [x] Verify `src/components/MeshViewer.tsx` → `MeshGeometry` already uses `filamentColors` state for input preview colours (it does — the `useEffect` depends on `[geometry, meshData, filamentColors, invalidate]`)
17. [x] Verify that when user edits filament colours while in Input preview mode, the 3D view updates (the `useEffect` already handles this)
18. [x] Add missing i18n keys for all new UI strings in `en`, `de`, `fr`, `es`, `zh` locale files

19. [x] Verification: Toggle to Input → model shows original paint colours; edit filament colour → input preview updates

## File Changes

| File | Action | Purpose |
| --- | --- | --- |
| `src/components/PaletteMapper.tsx` | Modify | Change transition default `maxCycleLength` to 1; pass `filamentColors` to editors |
| `src/state/AppContext.tsx` | Modify | Add `autoApply` state, `TOGGLE_AUTO_APPLY`/`MANUAL_APPLY` actions; merge uploaded layer height |
| `src/hooks/useProcessing.ts` | Modify | Respect `autoApply` flag; add manual apply trigger |
| `src/components/GlobalSettings.tsx` | Modify | Add auto-apply toggle + Apply button |
| `src/components/BresenhamEditor.tsx` | Modify | Rewrite preview; accept `filamentColors` prop; forgiving inputs; colour selectors |
| `src/components/TransitionEditor.tsx` | Modify | Accept `filamentColors` prop; update preview; forgiving inputs; colour selectors |
| `src/components/CyclicEditor.tsx` | Modify | Accept `filamentColors` prop; colour selectors |
| `src/i18n/locales/en.json` | Modify | Add new i18n keys |
| `src/i18n/locales/de.json` | Modify | Add new i18n keys |
| `src/i18n/locales/fr.json` | Modify | Add new i18n keys |
| `src/i18n/locales/es.json` | Modify | Add new i18n keys |
| `src/i18n/locales/zh.json` | Modify | Add new i18n keys |

## Testing Strategy

- [ ] Existing unit tests pass (`npm test`)
- [ ] Existing e2e tests pass (`npm run test:e2e`)
- [ ] Manual verification: upload 3MF → check layer height adoption, preview accuracy, input validation, colour propagation, auto-apply toggle

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `<option style>` background not visible in Safari | M | Acceptable — Safari is minority for 3D printing users; can switch to custom dropdown later |
| Forgiving input flicker during rapid typing | L | Local state is synchronous; config dispatch only on valid values |
| Auto-apply off + forgotten Apply | L | UI clearly shows stale state via disabled Apply button / processing status |
