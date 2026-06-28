# Frozen Module Interfaces (as of Wave 0)

Downstream waves code against these. Changing a signature requires updating consumers + tests, and a note here.

## Economy (pure functions — `apps/backend/src/economy`)
- `grantDailyEnergy(twin, now) -> Twin`
- `spendBeat(twin) -> { ok, twin }`
- `canAfford(wallet, amount) -> boolean`
- `charge(wallet, amount) -> { ok, wallet }`
- `refund(wallet, amount) -> Wallet`
- `estimateUsd(tokens, ratePer1k?) -> number`
- `projectCost(type) -> { energyCost, creditCost }`
- `canStartProject(type, twin, wallet) -> { ok, reason? }`

## Data ports (`packages/shared/src/interfaces.ts`)
- `TwinRepository { getById, save }` — impl: `DrizzleTwinRepository` (`apps/backend/src/db/twinRepository.ts`)
- `WalletRepository { getByUserId, applyDelta }` — impl: `DrizzleWalletRepository` (`apps/backend/src/db/walletRepository.ts`)

## Domain types (`packages/shared/src/types.ts`)
- `Twin`, `Wallet`, `Skills`, `SkillName`, `ProjectType`, `ProjectCost`, `DAILY_ENERGY`

## Environment / tooling notes (this machine)
- pnpm is provided via corepack. A shim is installed at `/opt/homebrew/bin/pnpm` (v9.12.0), so `pnpm ...` works directly. If it ever disappears, re-run: `corepack enable --install-directory /opt/homebrew/bin pnpm`.
- Data-layer integration tests use **testcontainers** over **Colima** Docker. Export before running DB tests:
  ```
  export DOCKER_HOST="unix:///Users/mehmet.akin/.colima/default/docker.sock"
  export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/var/run/docker.sock"
  export TESTCONTAINERS_RYUK_DISABLED="true"
  ```
- `db.session.client` is the drizzle 0.33 way to reach the raw postgres-js client (the plan's `db.$client` was outdated; helpers use `db.session.client`).

## Next wave dependencies
Wave 1 (agent-core, projects, world-render, onboarding) imports the economy
functions and the repository ports above. Do not break them without a migration note here.

## Wave 0 status: COMPLETE
- 7 test files, 29 tests passing (22 economy unit + 7 data integration).
- Typecheck clean across `@aivillage/shared` and `@aivillage/backend`.
