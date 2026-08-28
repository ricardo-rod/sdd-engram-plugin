# Contributing to Suite de Agentes

Thank you for your interest in contributing to **Suite de Agentes** (`opencode-agent-suite`). We welcome contributions that adhere to our development workflow, quality gates, and security requirements.

---

## 1. Issue-First Workflow

All contributions must originate from an approved GitHub issue:

1. **Check Existing Issues**: Search the repository issues to ensure the topic or bug is not already being addressed.
2. **Open a Proposal / Bug Report**: Clearly describe the motivation, scope, and technical considerations.
3. **Wait for Approval**: Do not start code implementation or open pull requests until the issue is reviewed and approved.

---

## 2. Development Setup

### Prerequisites
- **Node.js**: `24.x` (e.g. `24.14.0+`)
- **npm**: version compatible with Node 24
- **OpenCode**: version `1.18.5+`

### Initial Setup
```sh
# Clone your fork or checkout the repository
git clone https://github.com/<owner>/suite-de-agentes.git
cd suite-de-agentes

# Install dependencies
npm install

# Build artifacts
npm run build
```

---

## 3. Quality & Testing Standards

Every change must pass our verification gates before review:

```sh
# Run full unit and integration test suite
npm test

# Run strict TypeScript type checks
npm run typecheck

# Run production build
npm run build
```

- **Deterministic Tests**: Write tests using Vitest for all new features and bug fixes.
- **Strict Typing**: No `any` escapes or bypassed compiler checks.
- **Architectural Separation**: Maintain clear boundaries between `src/core` (pure logic and persistence), `src/server` (OpenCode runtime lifecycle hooks), and `src/tui` (OpenTUI user interface).

---

## 4. Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or capability
- `fix:` A bug fix
- `docs:` Documentation-only changes
- `test:` Adding or updating tests
- `refactor:` Code changes that neither fix bugs nor add features
- `chore:` Tooling, dependency, or configuration updates

### Rules
- Keep commit subjects concise and written in English in the imperative mood (e.g. `feat: add continuous cross-page catalog navigation`).
- **No AI Attribution**: Do not add `Co-Authored-By` or AI generator tags to commit messages or PR descriptions.

---

## 5. Security & Privacy Guardrails

- **No Secrets**: Never commit tokens, API keys, credentials, or private authentication cookies.
- **Platform Neutrality**: Do not commit private or user-specific filesystem paths (such as `/Users/<username>/...` or `C:\Users\<username>\...`). Always use generic placeholders in code, examples, and tests.
- **Atomic Persistence**: Ensure file writes to configuration registries use secure permissions (`0600`) and atomic temporary-file replacement.

---

## 6. Pull Request Checklist

Before submitting a pull request, ensure:
- [ ] The PR references an approved GitHub issue (`Fixes #<issue-number>`).
- [ ] All tests pass (`npm test`).
- [ ] TypeScript typecheck passes with zero errors (`npm run typecheck`).
- [ ] The build succeeds (`npm run build`).
- [ ] Relevant documentation under `docs/` is added or updated.
- [ ] Commits adhere to Conventional Commits with no AI attribution.
