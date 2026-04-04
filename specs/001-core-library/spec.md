# Phase 1: Core TypeScript Library

**Date**: 2026-04-04 | **Status**: In Progress

## Objective

Port all ~1,550 lines of Python processing logic to TypeScript as a pure library 
(no React dependencies). Validate algorithm parity with unit tests mirroring the 
Python test suite.

## Modules to Port (in order)

1. `encoding.ts` — Filament hex codec + bisection tree data structures
2. `config.ts` — Configuration types, JSON loading, validation
3. `palette.ts` — Cyclic + gradient dithering algorithms 
4. `mesh.ts` — Layer assignment, face clustering (typed arrays, no trimesh)
5. `threemf.ts` — 3MF ZIP read/write using fflate + DOMParser
6. `subdivision.ts` — Boundary face detection + recursive bisection encoding
7. `pipeline.ts` — Pipeline orchestration

## Dependencies

- `fflate` — ZIP compression/decompression for 3MF files

## Test Strategy

Each module gets a corresponding `.test.ts` file mirroring the Python test suite.
Tests use the same assertions and worked examples as the Python tests.

## Success Criteria

- [ ] All unit tests pass
- [ ] Encoding round-trip tests match Python worked examples exactly
- [ ] Palette output matches Python for identical inputs
- [ ] 3MF read/write round-trips produce valid ZIP structures
