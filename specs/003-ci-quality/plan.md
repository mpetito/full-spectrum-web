# Plan: CI Workflow, Code Quality & Dependabot

**Spec**: [spec.md](./spec.md) | **Date**: 2026-04-05

## Summary

Add a two-job CI workflow (`quality`, `e2e`) to gate all PRs with type checking, linting, unit tests, and end-to-end tests. CodeQL scanning is handled by the repository's default CodeQL workflow (auto-configured by GitHub). Add Dependabot for weekly npm and GitHub Actions updates. Streamline the existing `deploy.yml` by removing its redundant test step.

## Architecture Decisions

| Decision           | Choice                                                                     | Rationale                                                                          |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Job structure      | 2 chained jobs                                                             | `quality` is fast-fail gate; `e2e` waits on `quality`; CodeQL handled by default workflow |
| CodeQL             | Default CodeQL workflow (GitHub-managed)                                   | Avoids SARIF upload conflicts; auto-handles PR triggers and weekly schedule                |
| Playwright install | `npx playwright install --with-deps chromium`                              | Installs only Chromium + OS deps; matches `playwright.config.ts` single project    |
| Coverage provider  | `v8` via Vitest                                                            | Vitest default; no extra dependency                                                |
| Artifact retention | 7 days for Playwright report                                               | GitHub default; sufficient for debugging failed PRs                                |

## Implementation Phases

### Phase 1: CI Workflow

1. [ ] Create `.github/workflows/ci.yml` with the following structure:
   - **Trigger**: `push: branches [main]`, `pull_request: branches [main]`
   - **Job `quality`**:
     - `runs-on: ubuntu-latest`
     - `actions/checkout@v4`
     - `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm`
     - `npm ci`
     - `npx tsc -b` (type check)
     - `npx eslint .` (lint)
     - `npx vitest run --coverage` (unit + component tests)
   - **Job `e2e`**:
     - `needs: quality`
     - `runs-on: ubuntu-latest`
     - Checkout, setup Node (via `.nvmrc`), `npm ci`
     - `npx playwright install --with-deps chromium`
     - `npx playwright test`
     - Upload `playwright-report/` artifact on failure (`if: ${{ failure() }}`)
2. [ ] Verification: Push to a PR branch and confirm `quality` and `e2e` jobs run and pass.

### Phase 2: Dependabot Configuration

1. [ ] Create `.github/dependabot.yml`:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /
       schedule:
         interval: weekly
         day: monday
       open-pull-requests-limit: 5
       commit-message:
         prefix: "deps"
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
         day: monday
       open-pull-requests-limit: 5
       commit-message:
         prefix: "ci"
   ```
2. [ ] Verification: Confirm Dependabot tab shows the configuration is active after merging to `main`.

### Phase 3: Streamline Deploy Workflow

1. [ ] Edit `.github/workflows/deploy.yml`:
   - Remove the `npm test` step from the `build` job (CI already gates this)
   - Keep `npm run build` step (still needed for artifact generation)
2. [ ] Verification: Deploy workflow still builds and deploys successfully without the test step.

## File Changes

| File                           | Action | Purpose                                                                       |
| ------------------------------ | ------ | ----------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | Create | New CI workflow with `quality` and `e2e` jobs                                 |
| `.github/dependabot.yml`       | Create | Dependabot config for npm + GitHub Actions weekly updates                     |
| `.github/workflows/deploy.yml` | Modify | Remove redundant `npm test` step, switch to `node-version-file`               |
| `.nvmrc`                       | Create | Pin Node.js major version for local dev and CI                                |
| `.gitignore`                   | Modify | Add `coverage/` to ignored paths                                              |
| `package.json`                 | Modify | Add `@vitest/coverage-v8` dev dependency                                      |
| `package-lock.json`            | Modify | Reflect dependency and lockfile format changes                                |

## Testing Strategy

- [ ] Push CI workflow to a feature branch and open a PR to validate both jobs run
- [ ] Intentionally introduce a type error to verify `quality` job fails
- [ ] Intentionally introduce an ESLint violation to verify `quality` job fails
- [ ] Verify CodeQL SARIF upload in Security tab via the default CodeQL workflow
- [ ] Verify `e2e` job uploads Playwright report artifact on test failure
- [ ] Merge to `main` and verify Dependabot creates its first update PRs within a week
- [ ] Verify `deploy.yml` still deploys successfully after removing `npm test`

## Risks & Mitigations

| Risk                                        | Likelihood | Mitigation                                                                                                          |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Playwright install slow in CI               | M          | Cache is not practical for Playwright browsers; `--with-deps chromium` installs only one browser to minimize time   |
| CodeQL autobuild fails on Vite project      | L          | Delegated to GitHub's default CodeQL workflow which handles JS/TS extraction natively       |
| Dependabot PRs overwhelm reviewers          | L          | `open-pull-requests-limit: 5` caps concurrent PRs; weekly cadence is manageable                                     |
| Removing `npm test` from deploy creates gap | L          | Deploy only triggers on `main` push; CI runs on all PRs targeting `main`, so tests always run before merge          |
