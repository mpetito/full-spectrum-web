# Spec: CI Workflow, Code Quality & Dependabot

**Date**: 2026-04-05 | **Status**: Draft

## Context

The project currently has a single GitHub Actions workflow (`deploy.yml`) that runs `npm test` and `npm run build` only on pushes to `main`, then deploys to GitHub Pages. There is no dedicated CI pipeline for pull requests, no static-analysis or security scanning, and no automated dependency update mechanism. As the codebase grows (React 19, Three.js, Tailwind v4, fflate, Playwright), maintaining security posture and dependency freshness manually becomes unsustainable.

## Objective

Add a comprehensive CI pipeline that gates every PR with tests, type checking, linting, and security scanning — plus Dependabot for automated weekly dependency updates.

## Scope

### In Scope

- GitHub Actions CI workflow triggered on push to `main` and all PRs targeting `main`
- Vitest unit/component tests with coverage reporting
- TypeScript type checking (`tsc -b`)
- ESLint linting (`eslint .`)
- CodeQL security scanning for JavaScript/TypeScript
- Playwright e2e tests in CI
- Dependabot configuration for npm and GitHub Actions ecosystems
- Update `deploy.yml` to remove redundant test step (CI already covers testing)

### Out of Scope

- Deployment changes beyond removing the redundant test step
- Branch protection rule configuration (GitHub UI / Terraform)
- Third-party code quality services (SonarCloud, Codecov)
- Performance benchmarking or bundle-size tracking
- Docker or container-based workflows

## Requirements

### Functional

- **FR-1**: A `ci.yml` workflow runs on every push to `main` and every PR targeting `main`.
- **FR-2**: The CI workflow includes a `quality` job that runs `tsc -b`, `eslint .`, and `vitest run --coverage` in sequence.
- **FR-3**: CodeQL security scanning for JavaScript/TypeScript is handled by the repository's default CodeQL workflow (auto-configured by GitHub), running on PRs and weekly schedule.
- **FR-4**: The CI workflow includes an `e2e` job that installs Playwright browsers and runs `playwright test` with HTML report upload on failure.
- **FR-5**: A `dependabot.yml` configures weekly updates for the `npm` ecosystem (root `/`) and `github-actions` ecosystem (root `/`).
- **FR-6**: The `deploy.yml` workflow removes the redundant `npm test` step since CI already covers testing. Deploy gating via `workflow_run` or branch protection is out of scope.

### Non-Functional

- **NF-1**: CI completes in under 5 minutes for the `quality` job on typical PRs.
- **NF-2**: npm dependencies are cached via `actions/setup-node` cache to minimize install time.
- **NF-3**: The `e2e` job only runs after the `quality` job passes (fail fast).
- **NF-4**: CodeQL runs via the repository's default CodeQL workflow on a separate schedule (weekly) in addition to PR triggers.
- **NF-5**: Dependabot PRs are limited to 5 open at a time to avoid review fatigue.

## Design Constraints

- **Node 24**: Use Node 24 (LTS) consistently across CI workflows, matching the local development environment and `deploy.yml`.
- **npm**: Project uses npm (not pnpm/yarn) — `npm ci` for reproducible installs.
- **Playwright single project**: Only Desktop Chrome is configured; CI should match.
- **No secrets required**: All workflows must function without repository secrets (public repo, open-source tooling only).

## Acceptance Criteria

- [ ] Pushing a commit to a PR branch triggers the CI workflow with `quality` and `e2e` jobs
- [ ] CodeQL scanning runs via the repository's default CodeQL workflow (separate from ci.yml)
- [ ] `quality` job fails if TypeScript has type errors, ESLint reports violations, or any Vitest test fails
- [ ] CodeQL completes and uploads SARIF results to the Security tab via the default CodeQL workflow
- [ ] `e2e` job installs Playwright Chromium, runs e2e tests, and uploads HTML report artifact on failure
- [ ] `dependabot.yml` exists at `.github/dependabot.yml` with npm and github-actions ecosystems configured for weekly updates
- [ ] `deploy.yml` no longer runs tests redundantly (CI handles test gating)
- [ ] All existing tests continue to pass

## Decisions

| Decision                 | Choice                              | Rationale                                                |
| ------------------------ | ----------------------------------- | -------------------------------------------------------- |
| CI trigger               | `push: main` + `pull_request: main` | Covers direct pushes and PR validation                   |
| CodeQL schedule          | Default CodeQL workflow (GitHub-managed) | Avoids SARIF conflicts with ci.yml; auto-handles schedule and PR triggers |
| E2e job dependency       | `needs: quality`                    | Fail fast on cheap checks before expensive browser tests |
| Coverage tool            | Vitest built-in (`--coverage`)      | Already configured, no extra dependency needed           |
| Dependabot schedule      | Weekly (Monday)                     | Balances freshness with review burden                    |
| Dependabot open PR limit | 5                                   | Prevents flood of update PRs                             |
| Playwright artifact      | Upload only on failure              | Saves storage; successful runs don't need reports        |
| Deploy gating            | Remove `npm test` from deploy.yml   | CI workflow already gates; avoids double-testing         |

## Open Questions

- [ ] Should Dependabot be configured with specific reviewer assignments, or rely on CODEOWNERS? (Low risk — can be added later)
