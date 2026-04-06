# Contributing to Dither3D

Thank you for your interest in contributing! Dither3D is open source and welcomes
improvements of all kinds — bug fixes, new palette modes, UI enhancements,
documentation, and test coverage.

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
(v2.1). By participating you agree to uphold its standards.

## Getting Started

```bash
git clone https://github.com/mpetito/dither3d.git
cd dither3d
npm install
npm run dev       # Dev server at http://localhost:5173
npm test          # Run unit tests (Vitest)
npm run test:e2e  # Playwright end-to-end tests
npm run lint      # ESLint
```

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Make your changes with clear, focused commits.
3. Ensure `npm test` and `npm run lint` both pass with no new failures.
4. Open a pull request against `main` with a description of what changed and why.

## Palette and Algorithm Contributions

Changes to dithering logic (`src/lib/`) require visual evidence of correctness.
Please include in your PR description:

- A screenshot of the 3D preview showing clean horizontal color bands (no sawtooth
  artifacts) for the affected palette mode.
- The input 3MF used to generate the screenshot, or a description of the test object
  (e.g., "20mm cube, 0.1mm layer height, red→blue cyclic").

Unit tests alone are insufficient for palette correctness — the sawtooth artifact is
not detectable by scalar metrics alone.

## Reporting Issues

Use [GitHub Issues](https://github.com/mpetito/dither3d/issues). For bugs,
include the input 3MF (or a minimal reproduction), the browser and OS, and a
screenshot if relevant.

## License

By contributing, you agree that your contributions will be licensed under the
[AGPLv3 License](LICENSE).
