# TRADING ARENA — Production Architecture Specification

---

## 1. HIGH-LEVEL ARCHITECTURE OVERVIEW

```
                                    ┌─────────────────────────────────┐
                                    │        CDN / Edge Layer         │
                                    │   (Cloudflare / Vercel Edge)    │
                                    └──────────────┬──────────────────┘
                                                   │
                           ┌───────────────────────┼───────────────────────┐
                           │                       │                       │
                    ┌──────▼──────┐        ┌───────▼───────┐      ┌───────▼───────┐
                    │  Frontend   │        │   REST API    │      │  WebSocket    │
                    │  (React +   │◄──────►│   Gateway     │      │  Gateway      │
                    │   Vite)     │        │  (Express/    │      │  (Socket.io / │
                    │             │        │   Fastify)    │      │   ws + Redis) │
                    └─────────────┘        └───────┬───────┘      └───────┬───────┘
                                                   │                      │
                                    ┌──────────────┼──────────────────────┘
                                    │              │
                             ┌──────▼──────────────▼──────┐
                             │    APPLICATION CORE        │
                             │    (Modular Monolith)      │
                             │                            │
                             │  ┌──────┐ ┌──────┐ ┌────┐ │
                             │  │ Auth │ │ User │ │Bet │ │
                             │  └──────┘ └──────┘ └────┘ │
                             │  ┌──────┐ ┌──────┐ ┌────┐ │
                             │  │Wallet│ │Round │ │Game│ │
                             │  └──────┘ └──────┘ └────┘ │
                             │  ┌──────┐ ┌──────┐ ┌────┐ │
                             │  │Payout│ │Reward│ │Lead│ │
                             │  └──────┘ └──────┘ └────┘ │
                             │  ┌──────┐ ┌──────┐ ┌────┐ │
                             │  │Fraud │ │Admin │ │Feed│ │
                             │  └──────┘ └──────┘ └────┘ │
                             └────────┬───────┬───────┬──┘
                                      │       │       │
                         ┌────────────┤       │       ├────────────┐
                         │            │       │       │            │
                  ┌──────▼──┐  ┌──────▼──┐ ┌──▼────┐ │  ┌─────────▼──┐
                  │PostgreSQL│  │  Redis  │ │ Queue │ │  │  Solana     │
                  │ (Primary │  │ (Cache, │ │(Redis │ │  │  RPC /     │
                  │  + Read  │  │  PubSub,│ │Streams│ │  │  Chain     │
                  │ Replicas)│  │  Locks) │ │/ Bull)│ │  │  Monitor   │
                  └──────────┘  └─────────┘ └───────┘ │  └────────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Background     │
                                              │  Workers        │
                                              │  (Settlement,   │
                                              │   Deposits,     │
                                              │   Leaderboards, │
                                              │   Fraud)        │
                                              └─────────────────┘
```

### Core Principles

- **Server-authoritative**: All round outcomes, payouts, and balance mutations happen server-side. Clients render state received from the server.
- **Ledger-safe finances**: Every balance change produces an immutable ledger entry. No direct balance mutation.
- **Deterministic gameplay**: Given a seed, round generation is fully reproducible. Seeds are committed before rounds start.
- **Domain isolation**: Each module owns its data, exposes typed interfaces, and communicates through defined contracts.
- **Horizontal readiness**: Stateless API nodes, Redis-backed pubsub, partitioned workers — designed to scale without rewrite.

### Technology Selections

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + Vite + TypeScript | Fast dev, HMR, tree-shaking, already in use |
| API Server | Node.js + Fastify | Low latency, schema validation, TypeScript native |
| WebSocket | ws + Redis PubSub adapter | Raw performance, Redis fanout for multi-node |
| Database | PostgreSQL 16 | ACID, JSONB, row-level security, mature |
| Cache/PubSub | Redis 7 (Cluster mode) | Sub-ms reads, pub/sub, streams, sorted sets |
| Queue | BullMQ (Redis Streams) | Battle-tested, delayed jobs, retries, priorities |
| ORM/Query | Drizzle ORM | Type-safe, SQL-close, migration support |
| Chain | Solana Web3.js + Helius RPC | Reliable RPC, webhook support for deposits |
| Auth | Custom JWT + refresh tokens | Full control, no vendor lock |
| Observability | Pino (logs) + Prometheus + Grafana | Structured logs, metrics, dashboards |
| Deployment | Docker + Fly.io or Railway (Phase 1), K8s (Phase 3) | Simple start, scale later |

---

## 2. DOMAIN / SERVICE BREAKDOWN

### Domain Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRADING ARENA DOMAINS                      │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  IDENTITY   │   ECONOMY    │  GAMEPLAY    │   SOCIAL            │
│             │              │              │                     │
│ • Auth      │ • Wallet     │ • Round      │ • Leaderboard       │
│ • Session   │ • Balance    │ • Game Engine│ • Activity Feed     │
│ • User      │ • Deposit    │ • Bet        │ • Battle Rooms      │
│ • Profile   │ • Withdrawal │ • Payout     │ • Rankings          │
│ • VIP       │ • Ledger     │ • Liquidity  │                     │
│             │ • Treasury   │ • Replay     │                     │
├─────────────┼──────────────┼──────────────┼─────────────────────┤
│  PROGRESS   │   RISK       │  ADMIN       │   INFRA             │
│             │              │              │                     │
│ • XP/Level  │ • Fraud      │ • Config     │ • WebSocket GW      │
│ • Missions  │ • Rate Limit │ • Feature    │ • Queue Workers     │
│ • Achieve.  │ • Anomaly    │   Flags      │ • Chain Monitor     │
│ • Rakeback  │ • Multi-acc  │ • Audit Log  │ • Observability     │
│ • Seasons   │ • Risk Score │ • User Mgmt  │ • Secrets Vault     │
└─────────────┴──────────────┴──────────────┴─────────────────────┘
```

### Domain Ownership Rules

Each domain:
1. Owns its database tables — no cross-domain direct table access
2. Exposes a typed service interface (e.g., `WalletService.lockFunds()`)
3. Emits domain events for cross-domain reactions (e.g., `round.resolved` triggers `RewardsService.awardXP()`)
4. Has its own validation layer
5. Can be extracted to a standalone service by replacing in-process calls with RPC/HTTP

### Inter-Domain Communication

```
In-process (Phase 1):
  BetService.placeBet() → WalletService.lockFunds() → direct function call

Extracted (Phase 2+):
  BetService.placeBet() → HTTP/gRPC → WalletService.lockFunds()

Async cross-domain:
  RoundEngine emits "round.resolved" → EventBus
    → PayoutEngine.settle()
    → RewardsService.awardXP()
    → LeaderboardService.update()
    → FeedService.publish()
```

---

## 3. BACKEND MODULE BOUNDARIES

### Module Dependency Graph

```
                         ┌──────────┐
                         │  Auth    │
                         │  Module  │
                         └────┬─────┘
                              │ issues tokens, validates sessions
                              ▼
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Admin   │─────────►│  User    │◄─────────│ Rewards  │
│  Module  │          │  Module  │          │  Module  │
└──────────┘          └────┬─────┘          └────┬─────┘
                           │                     │
                           ▼                     │
                    ┌──────────┐                 │
                    │  Wallet  │◄────────────────┘
                    │  Module  │
                    └────┬─────┘
                         │ lockFunds / releaseFunds
                         ▼
                    ┌──────────┐     ┌──────────┐
                    │   Bet    │────►│  Round   │
                    │  Module  │     │  Engine  │
                    └──────────┘     └────┬─────┘
                                         │ generates round
                                         ▼
                                   ┌──────────┐
                                   │  Game    │
                                   │  Engine  │
                                   └────┬─────┘
                                        │ round resolved
                                        ▼
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
                    │Liquidity │◄──│  Payout  │──►│  Feed    │
                    │ Engine   │   │  Engine  │   │  Service │
                    └──────────┘   └────┬─────┘   └──────────┘
                                        │
                                        ▼
                                  ┌───────────┐
                                  │Leaderboard│
                                  │  Service  │
                                  └───────────┘
```

### Module Interface Contracts

```typescript
// === Auth Module ===
interface AuthModule {
  register(email: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<TokenPair>;
  loginWithWallet(signature: WalletSignature): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(sessionId: string): Promise<void>;
  validateToken(token: string): Promise<AuthContext>;
}

// === User Module ===
interface UserModule {
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, data: ProfileUpdate): Promise<UserProfile>;
  getStats(userId: string): Promise<UserStats>;
  getProgression(userId: string): Promise<ProgressionSummary>;
  addXP(userId: string, amount: number, source: string): Promise<LevelResult>;
  getVipTier(userId: string): Promise<VipTier>;
}

// === Wallet Module ===
interface WalletModule {
  getBalances(userId: string): Promise<BalanceSet>;
  lockFunds(userId: string, amount: bigint, ref: LedgerRef): Promise<LockResult>;
  releaseFunds(userId: string, amount: bigint, ref: LedgerRef): Promise<void>;
  settlePayout(userId: string, amount: bigint, ref: LedgerRef): Promise<void>;
  createDeposit(userId: string, asset: string): Promise<DepositInstructions>;
  createWithdrawal(userId: string, req: WithdrawRequest): Promise<WithdrawResult>;
  getTransactions(userId: string, filter: TxFilter): Promise<PaginatedTx>;
}

// === Bet Module ===
interface BetModule {
  placeBet(userId: string, req: BetRequest): Promise<BetResult>;
  cancelBet(userId: string, betId: string): Promise<void>;
  getBetsForRound(roundId: string): Promise<Bet[]>;
  getUserActiveBet(userId: string): Promise<Bet | null>;
}

// === Round Engine ===
interface RoundEngine {
  scheduleNext(): Promise<RoundRecord>;
  openEntry(roundId: string): Promise<void>;
  lockEntries(roundId: string): Promise<void>;
  generateRound(roundId: string): Promise<RoundPayload>;
  startRound(roundId: string): Promise<void>;
  freezeRound(roundId: string): Promise<void>;
  resolveRound(roundId: string): Promise<RoundResolution>;
}

// === Game Engine ===
interface GameEngine {
  generate(seed: string, config: EngineConfig): Promise<RoundPayload>;
  simulatePlayerOutcome(payload: RoundPayload, bet: Bet): Promise<PlayerOutcome>;
  generateReplay(roundId: string): Promise<ReplayData>;
}

// === Payout Engine ===
interface PayoutEngine {
  calculatePayouts(roundId: string, outcomes: PlayerOutcome[]): Promise<PayoutPlan>;
  executePayouts(plan: PayoutPlan): Promise<SettlementResult>;
  calculatePlatformFee(pool: PoolInfo): Promise<FeeBreakdown>;
}

// === Liquidity Engine ===
interface LiquidityEngine {
  getMode(): LiquidityMode; // 'p2p' | 'hybrid' | 'house'
  buildPool(roundId: string, bets: Bet[]): Promise<PoolInfo>;
  distributePool(pool: PoolInfo, rankings: PlayerRanking[]): Promise<Distribution>;
}

// === Rewards Module ===
interface RewardsModule {
  awardRoundXP(userId: string, result: BetResult): Promise<XPAward>;
  checkMissions(userId: string, event: GameEvent): Promise<MissionUpdate[]>;
  claimReward(userId: string, rewardId: string): Promise<ClaimResult>;
  calculateRakeback(userId: string, period: string): Promise<RakebackSummary>;
  getAchievements(userId: string): Promise<Achievement[]>;
}

// === Leaderboard Module ===
interface LeaderboardModule {
  update(userId: string, score: LeaderboardScore): Promise<void>;
  getLeaderboard(type: string, period: string, page: number): Promise<LeaderboardPage>;
  getUserRank(userId: string, type: string, period: string): Promise<RankInfo>;
  rebuildSnapshot(type: string, period: string): Promise<void>;
}

// === Fraud Module ===
interface FraudModule {
  scoreAction(userId: string, action: FraudAction): Promise<RiskScore>;
  flagUser(userId: string, flag: FlagInput): Promise<void>;
  checkWithdrawalRisk(userId: string, amount: bigint): Promise<WithdrawRisk>;
  getFlags(userId: string): Promise<RiskFlag[]>;
}
```

---

## 4. FRONTEND ARCHITECTURE

### Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | React 19 + Vite 6 | Already in use, fast HMR, excellent TS |
| Language | TypeScript (strict) | Type safety across entire frontend |
| State | Zustand (local) + React Query (server) | Minimal boilerplate, cache invalidation |
| Realtime | Native WebSocket client + reconnect logic | Full control, no Socket.io overhead on client |
| Routing | React Router v7 or TanStack Router | Type-safe routes, lazy loading |
| Chart Render | HTML5 Canvas (custom) | 60fps gameplay, already built |
| Styling | CSS-in-JS (inline styles + theme system) | Already in use, co-located with components |
| Animation | Framer Motion | Declarative, performant |
| Fonts | JetBrains Mono (data) + Inter (UI) | Already in use |

### Module Map

```
src/
├── app/                        # App shell
│   ├── App.tsx                 # Root component, router
│   ├── AppLayout.tsx           # TopBar + SideNav + content area
│   ├── TopBar.tsx              # Balance, user, notifications
│   ├── SideNav.tsx             # Navigation icons
│   └── NotificationLayer.tsx   # Toast / overlay system
│
├── features/                   # Domain-driven feature modules
│   ├── auth/                   # Login, register, wallet auth
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api.ts
│   │   └── store.ts
│   │
│   ├── gameplay/               # Core game experience
│   │   ├── components/
│   │   │   ├── LobbyScreen.tsx
│   │   │   ├── PlayingScreen.tsx
│   │   │   ├── ResultScreen.tsx
│   │   │   ├── ChartArena.tsx
│   │   │   ├── GameHUD.tsx
│   │   │   ├── MultiplierPopup.tsx
│   │   │   └── BattleRoom.tsx
│   │   ├── hooks/
│   │   │   ├── useRoundState.ts      # WebSocket round sync
│   │   │   ├── useChartRenderer.ts   # Canvas rendering loop
│   │   │   └── useNodeActivation.ts  # Node hit detection
│   │   ├── engine/                    # Client-side engine (render only)
│   │   │   ├── chartGenerator.ts
│   │   │   ├── nodeGenerator.ts
│   │   │   └── engineConfig.ts
│   │   ├── api.ts
│   │   └── store.ts
│   │
│   ├── wallet/                 # Economy features
│   │   ├── components/
│   │   │   ├── WalletScreen.tsx
│   │   │   ├── DepositFlow.tsx
│   │   │   ├── WithdrawFlow.tsx
│   │   │   └── TransactionHistory.tsx
│   │   ├── hooks/
│   │   │   └── useSolanaWallet.ts
│   │   ├── api.ts
│   │   └── store.ts
│   │
│   ├── social/                 # Leaderboards, feed, profiles
│   │   ├── components/
│   │   ├── api.ts
│   │   └── store.ts
│   │
│   ├── rewards/                # Missions, achievements, rakeback
│   │   ├── components/
│   │   ├── api.ts
│   │   └── store.ts
│   │
│   └── settings/               # User preferences
│       ├── components/
│       └── store.ts
│
├── shared/                     # Shared design system + utilities
│   ├── components/             # Button, Badge, Panel, Tab, Modal
│   ├── hooks/                  # useWebSocket, useCountdown, useDebounce
│   ├── api/                    # HTTP client, interceptors, error handling
│   ├── ws/                     # WebSocket client, reconnect, message router
│   ├── styles/                 # Theme, colors, typography, spacing
│   └── utils/                  # Formatters, validators, constants
│
└── types/                      # Shared TypeScript types
    ├── game.ts
    ├── wallet.ts
    ├── user.ts
    └── api.ts
```

### State Architecture

```
┌─────────────────────────────────────────────────────┐
│                  STATE LAYERS                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  SERVER STATE (React Query)                         │
│  ┌─────────────────────────────────────────┐       │
│  │ • User profile         (stale: 60s)     │       │
│  │ • Balances              (stale: 10s)     │       │
│  │ • Transaction history   (stale: 30s)     │       │
│  │ • Leaderboards          (stale: 30s)     │       │
│  │ • Missions              (stale: 60s)     │       │
│  │ • Round history         (stale: 30s)     │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  REALTIME STATE (Zustand, driven by WebSocket)      │
│  ┌─────────────────────────────────────────┐       │
│  │ • Active round payload                   │       │
│  │ • Round phase + elapsed                  │       │
│  │ • Live multiplier                        │       │
│  │ • Node activations                       │       │
│  │ • Battle rankings                        │       │
│  │ • Activity feed items                    │       │
│  │ • Countdown state                        │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  LOCAL UI STATE (Zustand / component state)         │
│  ┌─────────────────────────────────────────┐       │
│  │ • Selected bet amount                    │       │
│  │ • Selected risk tier                     │       │
│  │ • Selected mode                          │       │
│  │ • UI panels open/closed                  │       │
│  │ • Animation states                       │       │
│  │ • Form inputs                            │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  AUTH STATE (Zustand, persisted)                    │
│  ┌─────────────────────────────────────────┐       │
│  │ • JWT access token                       │       │
│  │ • Refresh token                          │       │
│  │ • User ID                                │       │
│  │ • Connected wallet address               │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### WebSocket Client Design

```typescript
// shared/ws/wsClient.ts

interface WSClient {
  connect(token: string): void;
  disconnect(): void;
  subscribe(topic: string, handler: (msg: WSMessage) => void): Unsubscribe;
  send(type: string, payload: unknown): void;
  onReconnect(cb: () => void): void;
  getState(): 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
}

// Reconnection strategy:
// - Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, max 5000ms
// - Jitter: ±20%
// - Max retries: 20 (then show "connection lost" UI)
// - On reconnect: re-subscribe all active topics, request state snapshot

// Message routing:
// Each incoming message has { type: string, payload: unknown }
// Router maps type → registered handlers
// Example: "round.progress" → gameplayStore.handleProgress()
```

### Critical Frontend Rules

1. **Client never generates round outcomes.** The current client-side engine is for RENDERING only — displaying the chart path and nodes received from the server.
2. **Balance displayed = server balance.** Never compute balances locally from bet/payout math.
3. **WebSocket reconnection must recover state.** On reconnect during active round, client requests current round snapshot.
4. **Optimistic updates only for non-financial UI** (e.g., button disabled state). Never optimistically update balances.

---

## 5. REALTIME ARCHITECTURE

### WebSocket Gateway

```
┌──────────────────────────────────────────────────────┐
│                 WebSocket Gateway                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Connection   │  │ Auth         │  │ Topic     │  │
│  │ Manager      │  │ Middleware   │  │ Router    │  │
│  │              │  │              │  │           │  │
│  │ • track      │  │ • validate   │  │ • route   │  │
│  │   connections│  │   JWT        │  │   msgs    │  │
│  │ • heartbeat  │  │ • attach     │  │ • fanout  │  │
│  │ • reconnect  │  │   userId     │  │   to subs │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │              Redis PubSub Adapter             │    │
│  │                                               │    │
│  │  Subscribe to channels:                       │    │
│  │  • round:{roundId}:*                          │    │
│  │  • battle:{roomId}:*                          │    │
│  │  • user:{userId}:*                            │    │
│  │  • global:feed                                │    │
│  │  • global:leaderboard                         │    │
│  │                                               │    │
│  │  Multi-node fanout:                           │    │
│  │  Any API/worker node publishes to Redis →     │    │
│  │  All WS gateway nodes receive + forward       │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Event Topics and Payloads

```typescript
// === Round Lifecycle Events ===

interface RoundCreatedEvent {
  type: 'round.created';
  roundId: string;
  mode: 'solo' | 'battle';
  startsAt: number;       // Unix ms
  entryDeadline: number;  // Unix ms
}

interface RoundEntryOpenEvent {
  type: 'round.entry_open';
  roundId: string;
  currentPlayers: number;
  poolSize: number;
}

interface RoundEntryClosingEvent {
  type: 'round.entry_closing';
  roundId: string;
  closesInMs: number;
}

interface RoundStartedEvent {
  type: 'round.started';
  roundId: string;
  payload: {
    chartPath: ChartPoint[];
    nodes: GameNodeDTO[];    // positions + types, NO outcome data
    duration: number;
    seedCommitment: string;  // hash of seed, revealed after round
  };
}

interface RoundProgressEvent {
  type: 'round.progress';
  roundId: string;
  elapsedMs: number;
  phase: RoundPhase;
}

interface RoundNodeActivatedEvent {
  type: 'round.node_activated';
  roundId: string;
  nodeId: string;
  activationType: 'hit' | 'near_miss' | 'missed';
}

interface RoundFrozenEvent {
  type: 'round.frozen';
  roundId: string;
  finalState: {
    chartEndPrice: number;
    totalNodesHit: number;
    totalNodesMissed: number;
  };
}

interface RoundResolvedEvent {
  type: 'round.resolved';
  roundId: string;
  results: PlayerResultDTO[];
  poolSummary: PoolSummaryDTO;
  seed: string;             // Revealed seed for verification
}

// === Battle Events ===

interface BattleRankUpdateEvent {
  type: 'battle.rank_update';
  roomId: string;
  rankings: { userId: string; username: string; multiplier: number; rank: number }[];
}

// === Feed Events ===

interface FeedActivityEvent {
  type: 'feed.activity';
  item: {
    id: string;
    feedType: 'big_win' | 'whale_bet' | 'battle_result' | 'achievement';
    payload: Record<string, unknown>;
    createdAt: number;
  };
}

// === User-specific Events ===

interface UserBalanceUpdateEvent {
  type: 'user.balance_update';
  userId: string;
  available: string;   // BigInt as string
  locked: string;
}

interface UserLevelUpEvent {
  type: 'user.level_up';
  userId: string;
  newLevel: number;
  newXP: number;
  xpToNext: number;
}
```

### Round Lifecycle (Server-Driven)

```
Time ──────────────────────────────────────────────────────────►

│ T-10s      │ T-5s        │ T-3s       │ T=0        │ T+15s      │ T+16s      │ T+18s
│            │             │            │            │            │            │
▼            ▼             ▼            ▼            ▼            ▼            ▼
SCHEDULED    ENTRY_OPEN    ENTRY_       LOCKED →     ACTIVE       FROZEN       RESOLVED
             │             CLOSING      GENERATED    │            │            │
             │             │            │            │            │            │
             │ Players     │ Warning    │ Seed       │ 15-second  │ Calculate  │ Payouts
             │ can join    │ "closing   │ committed  │ chart      │ outcomes   │ applied
             │ and bet     │  soon"     │ Round      │ playback   │            │ XP awarded
             │             │            │ payload    │ Node hits  │            │ Leaderboard
             │             │            │ generated  │ broadcast  │            │ updated
             │             │            │            │            │            │ Feed pub

Round Scheduler runs continuously:
- Creates next round while current is active
- Overlapping pipeline: while Round N is ACTIVE, Round N+1 is ENTRY_OPEN
```

### Server-Side Round State Machine

```typescript
enum RoundStatus {
  SCHEDULED = 'scheduled',
  ENTRY_OPEN = 'entry_open',
  ENTRY_CLOSING = 'entry_closing',
  LOCKED = 'locked',
  GENERATED = 'generated',
  ACTIVE = 'active',
  FROZEN = 'frozen',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
}

// Valid transitions:
// scheduled → entry_open → entry_closing → locked → generated → active → frozen → resolved → archived
// No skipping. No going backwards.

// State stored in:
// - PostgreSQL: rounds table (persistent record)
// - Redis: round:{id}:state (hot state for fast reads + pubsub)
```

### Server-Authoritative Node Activation

In production, node activation is NOT determined client-side. The server:

1. Pre-computes the chart path and node positions at generation time
2. During the active phase, server ticks at ~60Hz (or pre-computes all activations)
3. Server emits `round.node_activated` events at the correct timestamps
4. Clients render the activation effects — they do NOT determine if a node was hit

This eliminates any client-side cheating vector for outcomes.

---

## 6. DATABASE SCHEMA DESIGN

### Entity Relationship Overview

```
users ──────┬──── user_profiles
            ├──── user_sessions
            ├──── linked_wallets
            ├──── balances
            ├──── balance_ledger_entries
            ├──── deposits
            ├──── withdrawals
            ├──── bets ──────── bet_results
            ├──── user_mission_progress
            ├──── user_achievements
            ├──── leaderboard_snapshots
            └──── risk_flags

rounds ─────┬──── round_pools
            ├──── round_nodes
            ├──── round_events
            └──── bets

missions
achievements
activity_feed_items
feature_flags
admin_audit_logs
```

### Full Schema (PostgreSQL DDL)

```sql
-- ============================================================
-- IDENTITY & ACCESS
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT,                          -- NULL if wallet-only auth
    status          TEXT NOT NULL DEFAULT 'active', -- active, suspended, banned
    role            TEXT NOT NULL DEFAULT 'player', -- player, admin, superadmin
    vip_tier        TEXT NOT NULL DEFAULT 'bronze', -- bronze, silver, gold, platinum, titan
    level           INTEGER NOT NULL DEFAULT 1,
    xp_total        BIGINT NOT NULL DEFAULT 0,
    xp_current      BIGINT NOT NULL DEFAULT 0,     -- XP within current level
    xp_to_next      BIGINT NOT NULL DEFAULT 100,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_vip_tier ON users(vip_tier);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE user_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id),
    display_name    TEXT,
    avatar_url      TEXT,
    country         TEXT,
    preferences     JSONB NOT NULL DEFAULT '{}',
    risk_flags      JSONB NOT NULL DEFAULT '[]',
    total_wagered   BIGINT NOT NULL DEFAULT 0,     -- in smallest unit (lamports/cents)
    total_won       BIGINT NOT NULL DEFAULT 0,
    rounds_played   INTEGER NOT NULL DEFAULT 0,
    best_multiplier NUMERIC(10,4) NOT NULL DEFAULT 1.0,
    win_rate        NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    current_streak  INTEGER NOT NULL DEFAULT 0,
    best_streak     INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    refresh_token_hash  TEXT NOT NULL,
    device_fingerprint  TEXT,
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE linked_wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    chain           TEXT NOT NULL DEFAULT 'solana',  -- solana, ethereum, etc.
    address         TEXT NOT NULL,
    wallet_type     TEXT NOT NULL DEFAULT 'phantom',  -- phantom, solflare, backpack
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(chain, address)
);

CREATE INDEX idx_wallets_user ON linked_wallets(user_id);
CREATE INDEX idx_wallets_address ON linked_wallets(chain, address);

-- ============================================================
-- WALLET & TREASURY
-- ============================================================

CREATE TABLE balances (
    user_id             UUID NOT NULL REFERENCES users(id),
    asset               TEXT NOT NULL DEFAULT 'USDC',  -- USDC, SOL
    available_amount    BIGINT NOT NULL DEFAULT 0,     -- in smallest unit
    locked_amount       BIGINT NOT NULL DEFAULT 0,
    pending_amount      BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, asset),
    CONSTRAINT positive_amounts CHECK (
        available_amount >= 0 AND locked_amount >= 0 AND pending_amount >= 0
    )
);

CREATE TABLE balance_ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           TEXT NOT NULL DEFAULT 'USDC',
    entry_type      TEXT NOT NULL,
    -- entry_type values:
    -- bet_lock, bet_unlock, bet_settle, payout_credit,
    -- deposit_pending, deposit_confirmed,
    -- withdraw_lock, withdraw_complete, withdraw_cancel,
    -- rakeback_credit, admin_adjustment
    amount          BIGINT NOT NULL,              -- positive = credit, negative = debit
    balance_after   BIGINT NOT NULL,              -- balance snapshot after this entry
    reference_type  TEXT NOT NULL,                 -- bet, round, deposit, withdrawal, admin
    reference_id    TEXT NOT NULL,                 -- FK to the source record
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_user ON balance_ledger_entries(user_id, created_at DESC);
CREATE INDEX idx_ledger_ref ON balance_ledger_entries(reference_type, reference_id);
CREATE INDEX idx_ledger_type ON balance_ledger_entries(entry_type, created_at DESC);

CREATE TABLE deposits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           TEXT NOT NULL DEFAULT 'USDC',
    amount          BIGINT NOT NULL,
    tx_hash         TEXT UNIQUE,
    from_address    TEXT,
    to_address      TEXT NOT NULL,                -- platform deposit address
    status          TEXT NOT NULL DEFAULT 'pending',
    -- pending, confirming, confirmed, failed, expired
    confirmations   INTEGER NOT NULL DEFAULT 0,
    required_confirmations INTEGER NOT NULL DEFAULT 1,
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deposits_user ON deposits(user_id, created_at DESC);
CREATE INDEX idx_deposits_status ON deposits(status) WHERE status IN ('pending', 'confirming');
CREATE INDEX idx_deposits_tx ON deposits(tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE withdrawals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           TEXT NOT NULL DEFAULT 'USDC',
    amount          BIGINT NOT NULL,
    fee             BIGINT NOT NULL DEFAULT 0,
    destination     TEXT NOT NULL,                 -- wallet address
    tx_hash         TEXT,
    status          TEXT NOT NULL DEFAULT 'pending_review',
    -- pending_review, approved, processing, broadcast, confirmed, failed, cancelled
    risk_score      NUMERIC(5,2) DEFAULT 0,
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawals_user ON withdrawals(user_id, created_at DESC);
CREATE INDEX idx_withdrawals_status ON withdrawals(status)
    WHERE status IN ('pending_review', 'approved', 'processing', 'broadcast');

-- ============================================================
-- ROUNDS & GAMEPLAY
-- ============================================================

CREATE TABLE rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode            TEXT NOT NULL DEFAULT 'solo',   -- solo, battle
    status          TEXT NOT NULL DEFAULT 'scheduled',
    -- scheduled, entry_open, entry_closing, locked, generated,
    -- active, frozen, resolved, archived
    scheduled_at    TIMESTAMPTZ NOT NULL,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    seed            TEXT,                           -- revealed after resolution
    seed_commitment TEXT,                           -- SHA256(seed), committed before start
    config_snapshot JSONB NOT NULL,                 -- frozen EngineConfig at generation time
    chart_path      JSONB,                          -- generated chart data
    duration_ms     INTEGER NOT NULL DEFAULT 15000,
    player_count    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_rounds_scheduled ON rounds(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_rounds_mode ON rounds(mode, created_at DESC);

CREATE TABLE round_pools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id        UUID NOT NULL REFERENCES rounds(id),
    pool_type       TEXT NOT NULL DEFAULT 'main',  -- main, battle_room
    liquidity_mode  TEXT NOT NULL DEFAULT 'p2p',   -- p2p, hybrid, house
    gross_pool      BIGINT NOT NULL DEFAULT 0,
    fee_amount      BIGINT NOT NULL DEFAULT 0,
    fee_rate        NUMERIC(5,4) NOT NULL DEFAULT 0.03, -- 3%
    net_pool        BIGINT NOT NULL DEFAULT 0,
    player_count    INTEGER NOT NULL DEFAULT 0,
    settled         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pools_round ON round_pools(round_id);

CREATE TABLE round_nodes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id            UUID NOT NULL REFERENCES rounds(id),
    node_type           TEXT NOT NULL,              -- multiplier, divider, shield, fake_breakout, volatility_spike
    node_value          NUMERIC(10,4) NOT NULL,
    spawn_time_ms       INTEGER NOT NULL,           -- ms offset from round start
    path_y              NUMERIC(10,6) NOT NULL,     -- normalized 0-1
    activation_radius   NUMERIC(10,6) NOT NULL,
    near_miss_radius    NUMERIC(10,6),
    rarity              TEXT NOT NULL DEFAULT 'common',
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodes_round ON round_nodes(round_id);

CREATE TABLE round_events (
    id              BIGSERIAL PRIMARY KEY,
    round_id        UUID NOT NULL REFERENCES rounds(id),
    event_type      TEXT NOT NULL,
    -- node_activated, node_missed, near_miss, phase_change,
    -- fake_breakout_triggered, volatility_spike_triggered
    event_time_ms   INTEGER NOT NULL,               -- ms offset from round start
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_round ON round_events(round_id, event_time_ms);

-- ============================================================
-- BETS & RESULTS
-- ============================================================

CREATE TABLE bets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    round_id        UUID NOT NULL REFERENCES rounds(id),
    pool_id         UUID REFERENCES round_pools(id),
    amount          BIGINT NOT NULL,
    fee             BIGINT NOT NULL DEFAULT 0,
    risk_tier       TEXT NOT NULL DEFAULT 'balanced',
    bet_size_tier   TEXT NOT NULL DEFAULT 'small',
    powerups        JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending',
    -- pending, locked, active, settled, cancelled, refunded
    locked_at       TIMESTAMPTZ,
    settled_at      TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,                    -- client-provided dedup key
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, round_id)                       -- one bet per user per round
);

CREATE INDEX idx_bets_user ON bets(user_id, created_at DESC);
CREATE INDEX idx_bets_round ON bets(round_id);
CREATE INDEX idx_bets_status ON bets(status) WHERE status IN ('pending', 'locked', 'active');

CREATE TABLE bet_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bet_id              UUID UNIQUE NOT NULL REFERENCES bets(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    round_id            UUID NOT NULL REFERENCES rounds(id),
    final_multiplier    NUMERIC(10,4) NOT NULL,
    final_score         NUMERIC(12,4) NOT NULL,     -- for ranking
    rank_position       INTEGER,                     -- 1-based, NULL for solo
    payout_amount       BIGINT NOT NULL DEFAULT 0,
    rakeback_amount     BIGINT NOT NULL DEFAULT 0,
    xp_awarded          INTEGER NOT NULL DEFAULT 0,
    nodes_hit           INTEGER NOT NULL DEFAULT 0,
    nodes_missed        INTEGER NOT NULL DEFAULT 0,
    near_misses         INTEGER NOT NULL DEFAULT 0,
    result_type         TEXT NOT NULL,               -- win, loss, breakeven
    result_detail       JSONB,                       -- detailed node-by-node breakdown
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_user ON bet_results(user_id, created_at DESC);
CREATE INDEX idx_results_round ON bet_results(round_id);

-- ============================================================
-- PROGRESSION & REWARDS
-- ============================================================

CREATE TABLE missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_type    TEXT NOT NULL,                   -- daily, weekly, seasonal, permanent
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    config          JSONB NOT NULL,
    -- { "type": "play_rounds", "target": 5, "reward_xp": 50, "reward_balance": 0 }
    active_from     TIMESTAMPTZ NOT NULL,
    active_to       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_missions_active ON missions(active_from, active_to);

CREATE TABLE user_mission_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    mission_id      UUID NOT NULL REFERENCES missions(id),
    progress        INTEGER NOT NULL DEFAULT 0,
    target          INTEGER NOT NULL,
    completed_at    TIMESTAMPTZ,
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, mission_id)
);

CREATE INDEX idx_mission_progress_user ON user_mission_progress(user_id)
    WHERE completed_at IS NULL;

CREATE TABLE achievements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    achievement_type    TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    icon                TEXT,
    config              JSONB NOT NULL,
    -- { "type": "best_multiplier", "threshold": 10.0 }
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    achievement_id  UUID NOT NULL REFERENCES achievements(id),
    unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements ON user_achievements(user_id);

-- ============================================================
-- SOCIAL & COMPETITIVE
-- ============================================================

CREATE TABLE leaderboard_snapshots (
    id                  BIGSERIAL PRIMARY KEY,
    leaderboard_type    TEXT NOT NULL,               -- volume, multiplier, streak, wins
    period_key          TEXT NOT NULL,               -- daily:2026-03-09, weekly:2026-W10, season:1
    user_id             UUID NOT NULL REFERENCES users(id),
    rank                INTEGER NOT NULL,
    score               NUMERIC(16,4) NOT NULL,
    metadata            JSONB,
    snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(leaderboard_type, period_key, user_id)
);

CREATE INDEX idx_leaderboard_rank ON leaderboard_snapshots(leaderboard_type, period_key, rank);

CREATE TABLE activity_feed_items (
    id              BIGSERIAL PRIMARY KEY,
    feed_type       TEXT NOT NULL,
    -- big_win, whale_bet, battle_result, achievement_unlock, level_up
    user_id         UUID REFERENCES users(id),
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_created ON activity_feed_items(created_at DESC);
CREATE INDEX idx_feed_type ON activity_feed_items(feed_type, created_at DESC);

-- ============================================================
-- RISK & FRAUD
-- ============================================================

CREATE TABLE risk_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    flag_type       TEXT NOT NULL,
    -- multi_account, bot_suspect, abnormal_volume, collusion_suspect,
    -- suspicious_withdrawal, device_anomaly
    severity        TEXT NOT NULL DEFAULT 'low',    -- low, medium, high, critical
    metadata        JSONB NOT NULL DEFAULT '{}',
    resolved        BOOLEAN NOT NULL DEFAULT false,
    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_user ON risk_flags(user_id);
CREATE INDEX idx_risk_unresolved ON risk_flags(severity, created_at DESC) WHERE NOT resolved;

-- ============================================================
-- ADMIN & OPERATIONS
-- ============================================================

CREATE TABLE admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    actor_user_id   UUID NOT NULL REFERENCES users(id),
    action_type     TEXT NOT NULL,
    -- config_update, user_suspend, withdrawal_approve, feature_flag_toggle,
    -- round_config_update, manual_payout, balance_adjustment
    target_type     TEXT NOT NULL,                   -- user, round, config, feature_flag
    target_id       TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor ON admin_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON admin_audit_logs(target_type, target_id, created_at DESC);

CREATE TABLE feature_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key        TEXT UNIQUE NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    config          JSONB NOT NULL DEFAULT '{}',
    description     TEXT,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ENGINE CONFIGURATION (versioned)
-- ============================================================

CREATE TABLE engine_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version         INTEGER NOT NULL,
    config          JSONB NOT NULL,                  -- Full EngineConfig object
    is_active       BOOLEAN NOT NULL DEFAULT false,
    activated_at    TIMESTAMPTZ,
    activated_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(version)
);

CREATE INDEX idx_engine_config_active ON engine_configs(is_active) WHERE is_active = true;
```

---

## 7. REDIS USAGE PLAN

### Key Namespaces

```
┌──────────────────────────────────────────────────────────────────┐
│ NAMESPACE                │ TYPE        │ TTL      │ PURPOSE      │
├──────────────────────────┼─────────────┼──────────┼──────────────┤
│ round:{id}:state         │ Hash        │ 5 min    │ Hot round    │
│ round:{id}:players       │ Set         │ 5 min    │ Player list  │
│ round:{id}:payload       │ String/JSON │ 5 min    │ Chart+nodes  │
│ round:next               │ String      │ 30s      │ Next round ID│
│ round:current            │ String      │ 30s      │ Active round │
├──────────────────────────┼─────────────┼──────────┼──────────────┤
│ session:{token}          │ Hash        │ 15 min   │ Session cache│
│ user:{id}:balance        │ Hash        │ 30s      │ Balance cache│
├──────────────────────────┼─────────────┼──────────┼──────────────┤
│ lb:{type}:{period}       │ Sorted Set  │ 60s      │ Leaderboard  │
│ feed:global              │ List        │ 10 min   │ Activity feed│
├──────────────────────────┼─────────────┼──────────┼──────────────┤
│ ratelimit:{ip}:{endpoint}│ String+INCR │ window   │ Rate limiting│
│ lock:bet:{userId}        │ String+EX   │ 5s       │ Bet dedup    │
│ lock:withdraw:{userId}   │ String+EX   │ 30s      │ Withdraw lock│
│ lock:round:{id}:settle   │ String+EX   │ 60s      │ Settle lock  │
│ idempotent:{key}         │ String      │ 5 min    │ Idempotency  │
├──────────────────────────┼─────────────┼──────────┼──────────────┤
│ ws:connections            │ HyperLogLog│ —        │ Conn count   │
│ metrics:rounds_settled   │ String+INCR │ —        │ Counter      │
│ ff:{flagKey}             │ String      │ 60s      │ Feature flag │
└──────────────────────────┴─────────────┴──────────┴──────────────┘
```

### PubSub Channels

```
Channel: round:{roundId}
  → All round lifecycle events for that round

Channel: battle:{roomId}
  → Battle-specific ranking updates

Channel: user:{userId}
  → Personal events (balance update, level up, bet result)

Channel: global:feed
  → Activity feed items (big wins, whale bets)

Channel: global:leaderboard
  → Leaderboard refresh signals
```

### Critical Rule

> Redis is NEVER the source of truth for balances. PostgreSQL `balances` table + `balance_ledger_entries` is authoritative. Redis caches balance reads with short TTL and is invalidated on every write.

---

## 8. EVENTING / QUEUE STRATEGY

### Queue Technology: BullMQ (Redis Streams)

BullMQ provides delayed jobs, retries with backoff, priority queues, rate limiting, and dead letter queues — all backed by Redis Streams. No additional infrastructure needed in Phase 1.

### Queue Definitions

```typescript
// Queue: round-lifecycle
// Manages scheduled round state transitions
{
  name: 'round-lifecycle',
  jobs: [
    { type: 'open_entry',     delay: 'scheduled_at - 10s' },
    { type: 'close_entry',    delay: 'scheduled_at - 3s'  },
    { type: 'lock_round',     delay: 'scheduled_at - 1s'  },
    { type: 'generate_round', delay: 'scheduled_at - 500ms'},
    { type: 'start_round',    delay: 'scheduled_at'       },
    { type: 'freeze_round',   delay: 'scheduled_at + 15s' },
    { type: 'resolve_round',  delay: 'scheduled_at + 16s' },
  ],
  retries: 3,
  backoff: { type: 'exponential', delay: 500 },
}

// Queue: settlement
// Handles post-round financial settlement
{
  name: 'settlement',
  jobs: [
    { type: 'calculate_payouts' },
    { type: 'execute_payouts' },
    { type: 'award_xp' },
    { type: 'update_leaderboards' },
    { type: 'publish_feed' },
    { type: 'check_achievements' },
  ],
  retries: 5,
  backoff: { type: 'exponential', delay: 1000 },
  // Settlement jobs are CRITICAL — failures go to dead letter queue + alert
}

// Queue: deposits
// Monitors and confirms on-chain deposits
{
  name: 'deposits',
  jobs: [
    { type: 'check_confirmation' },
    { type: 'confirm_deposit' },
    { type: 'credit_balance' },
  ],
  retries: 10,
  backoff: { type: 'fixed', delay: 5000 },
}

// Queue: withdrawals
// Processes withdrawal pipeline
{
  name: 'withdrawals',
  jobs: [
    { type: 'risk_check' },
    { type: 'approve_withdrawal' },
    { type: 'broadcast_transaction' },
    { type: 'confirm_withdrawal' },
  ],
  retries: 3,
  backoff: { type: 'exponential', delay: 2000 },
}

// Queue: background
// Non-critical background work
{
  name: 'background',
  jobs: [
    { type: 'rebuild_leaderboard' },
    { type: 'compute_rakeback' },
    { type: 'fraud_scoring' },
    { type: 'analytics_pipeline' },
    { type: 'cleanup_expired_sessions' },
  ],
  retries: 2,
  backoff: { type: 'fixed', delay: 5000 },
}
```

### Outbox Pattern for Critical Events

For financial events that MUST be processed (settlements, balance changes), use the transactional outbox pattern:

```
┌─────────────────────────────────────────────┐
│          PostgreSQL Transaction              │
│                                             │
│  1. UPDATE balances SET available = ...     │
│  2. INSERT INTO balance_ledger_entries ...   │
│  3. INSERT INTO outbox_events (             │
│       event_type, payload, status='pending' │
│     )                                       │
│                                             │
│  COMMIT                                     │
└──────────────────────┬──────────────────────┘
                       │
              ┌────────▼────────┐
              │  Outbox Poller  │
              │  (every 100ms)  │
              │                 │
              │  SELECT * FROM  │
              │  outbox_events  │
              │  WHERE status = │
              │  'pending'      │
              │  FOR UPDATE     │
              │  SKIP LOCKED    │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Publish to     │
              │  BullMQ /       │
              │  Redis PubSub   │
              │                 │
              │  Mark as        │
              │  'published'    │
              └─────────────────┘
```

```sql
CREATE TABLE outbox_events (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending, published, failed
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at)
    WHERE status = 'pending';
```

This guarantees: if the DB transaction commits, the event WILL be processed. No lost settlements.

---

## 9. WALLET / SOLANA INTEGRATION DESIGN

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    WALLET ARCHITECTURE                        │
│                                                              │
│  ┌─────────────────┐       ┌──────────────────────────┐     │
│  │  Frontend        │       │  Backend Wallet Module    │     │
│  │                  │       │                          │     │
│  │  Phantom /       │       │  ┌──────────────────┐   │     │
│  │  Solflare /      │──────►│  │  Deposit Service │   │     │
│  │  Backpack        │       │  │  • address gen   │   │     │
│  │  Adapter         │       │  │  • tx monitoring │   │     │
│  │                  │       │  │  • confirmation  │   │     │
│  │  @solana/        │       │  └──────────────────┘   │     │
│  │  wallet-adapter  │       │                          │     │
│  └─────────────────┘       │  ┌──────────────────┐   │     │
│                             │  │ Withdraw Service │   │     │
│                             │  │  • risk check    │   │     │
│                             │  │  • approval flow │   │     │
│                             │  │  • tx broadcast  │   │     │
│                             │  │  • confirmation  │   │     │
│                             │  └──────────────────┘   │     │
│                             │                          │     │
│                             │  ┌──────────────────┐   │     │
│                             │  │ Balance Service  │   │     │
│                             │  │  • ledger ops    │   │     │
│                             │  │  • lock/unlock   │   │     │
│                             │  │  • reconcile     │   │     │
│                             │  └──────────────────┘   │     │
│                             └──────────┬───────────────┘     │
│                                        │                     │
│  ┌─────────────────────────────────────▼──────────────────┐  │
│  │              Solana Integration Layer                   │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ Helius RPC   │  │ Helius       │  │ Hot Wallet  │  │  │
│  │  │ (read txs,   │  │ Webhooks     │  │ Signer      │  │  │
│  │  │  balances)   │  │ (deposit     │  │ (isolated   │  │  │
│  │  │              │  │  notifications│  │  process)   │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Deposit Flow

```
User clicks "Deposit" →
  1. Frontend shows deposit address (unique per user per asset)
  2. User sends SOL/USDC from their wallet to the deposit address
  3. Helius Webhook fires on incoming transaction
  4. Backend validates: correct address, correct asset, sufficient amount
  5. Create deposit record (status: 'confirming')
  6. Wait for required confirmations (1 for Solana finalized)
  7. On confirmation:
     a. BEGIN TRANSACTION
     b. UPDATE deposit SET status = 'confirmed'
     c. UPDATE balances SET available_amount = available_amount + amount
     d. INSERT ledger entry (deposit_confirmed)
     e. INSERT outbox event (deposit.confirmed)
     f. COMMIT
  8. Publish balance update to user via WebSocket
  9. Sweep deposit address to hot wallet (batched, background)
```

### Withdrawal Flow

```
User requests withdrawal →
  1. Validate: sufficient available balance
  2. Fraud/risk check: score the withdrawal
  3. BEGIN TRANSACTION
     a. UPDATE balances SET available -= amount, locked += amount
     b. INSERT ledger entry (withdraw_lock)
     c. INSERT withdrawal record (status: 'pending_review')
     d. COMMIT
  4. If risk_score < auto_approve_threshold:
     → Auto-approve, queue broadcast
  5. If risk_score >= threshold:
     → Hold for manual review (admin dashboard)
  6. On approval:
     a. Sign transaction with hot wallet (isolated signer process)
     b. Broadcast to Solana
     c. Wait for confirmation
     d. BEGIN TRANSACTION
        - UPDATE withdrawal SET status = 'confirmed', tx_hash = ...
        - UPDATE balances SET locked -= amount
        - INSERT ledger entry (withdraw_complete)
        - COMMIT
  7. Publish balance update to user
```

### Key Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| Private key isolation | Hot wallet signer runs as isolated process/container. Keys never in app memory. |
| Key storage | Vault (HashiCorp Vault) or cloud KMS (AWS KMS / GCP KMS) |
| Withdrawal limits | Per-user daily limits. Higher limits require manual approval. |
| Hot wallet limits | Hot wallet holds maximum 24h of projected withdrawals. Excess in cold wallet. |
| Sweep automation | Deposit addresses swept to hot wallet on schedule. Avoids dust accumulation. |
| Reconciliation | Nightly job compares on-chain balances vs DB balances. Alerts on mismatch. |

### Supported Assets (Phase 1)

| Asset | Token | Decimals | Min Deposit | Min Withdrawal |
|-------|-------|----------|-------------|----------------|
| USDC | SPL Token | 6 | $5 | $10 |
| SOL | Native | 9 | 0.1 SOL | 0.2 SOL |

---

## 10. SECURITY ARCHITECTURE

### Layered Security Model

```
┌─────────────────────────────────────────────────┐
│  Layer 1: NETWORK                               │
│  • Cloudflare WAF / DDoS protection             │
│  • TLS 1.3 everywhere                           │
│  • IP reputation filtering                      │
│  • Geographic restrictions if needed             │
├─────────────────────────────────────────────────┤
│  Layer 2: EDGE / CDN                            │
│  • Rate limiting at edge                        │
│  • Bot challenge (Turnstile / hCaptcha)         │
│  • Static asset caching                         │
├─────────────────────────────────────────────────┤
│  Layer 3: API GATEWAY                           │
│  • JWT validation                               │
│  • CORS enforcement                             │
│  • Request schema validation (Fastify schemas)  │
│  • Content-Type enforcement                     │
│  • Request size limits                          │
├─────────────────────────────────────────────────┤
│  Layer 4: APPLICATION                           │
│  • Input sanitization                           │
│  • Parameterized queries (Drizzle ORM)          │
│  • CSRF tokens for state-changing ops           │
│  • Output encoding (XSS prevention)             │
│  • Strict CSP headers                           │
│  • Authorization checks per endpoint            │
├─────────────────────────────────────────────────┤
│  Layer 5: DATA                                  │
│  • Encrypted at rest (PostgreSQL TDE)           │
│  • Encrypted in transit                         │
│  • Sensitive fields hashed (passwords: argon2)  │
│  • PII access logging                           │
│  • Database connection encryption               │
├─────────────────────────────────────────────────┤
│  Layer 6: INFRASTRUCTURE                        │
│  • Secrets in Vault / cloud secrets manager     │
│  • Least-privilege IAM                          │
│  • Container image scanning                     │
│  • Network segmentation (DB not public)         │
│  • Audit logs for all admin actions             │
└─────────────────────────────────────────────────┘
```

### Authentication Design

```typescript
// JWT Structure
interface AccessToken {
  sub: string;        // user ID
  role: string;       // player | admin | superadmin
  sid: string;        // session ID
  iat: number;
  exp: number;        // 15 minutes
}

interface RefreshToken {
  sub: string;
  sid: string;
  iat: number;
  exp: number;        // 7 days
  // Stored as hash in DB — not the raw token
}

// Token Flow:
// 1. Login → issue access + refresh tokens
// 2. Access token in Authorization header (Bearer)
// 3. Refresh token in httpOnly secure cookie
// 4. On 401 → client auto-refreshes using cookie
// 5. Refresh rotates both tokens (old refresh invalidated)
// 6. Logout → revoke session, blacklist access token in Redis (TTL = remaining exp)
```

### Wallet Authentication

```
1. Client requests challenge: GET /auth/wallet/challenge?address=...
   → Server returns: { nonce: "random-32-bytes", message: "Sign to login to Trading Arena\nNonce: ..." }

2. User signs message with Phantom/Solflare
   → Client sends: POST /auth/wallet/verify { address, signature, nonce }

3. Server verifies:
   a. Nonce exists in Redis and not expired (60s TTL)
   b. Signature is valid for the message + address
   c. Delete nonce (one-time use)

4. If address linked to user → issue tokens
5. If new address → create user + link wallet + issue tokens
```

### Rate Limiting Strategy

| Endpoint Group | Limit | Window | Key |
|----------------|-------|--------|-----|
| Auth (login/register) | 5 | 1 min | IP |
| Auth (wallet challenge) | 10 | 1 min | IP |
| Bet placement | 2 | 5 sec | userId |
| Withdrawal create | 3 | 1 hour | userId |
| General API | 100 | 1 min | userId |
| WebSocket connect | 5 | 1 min | IP |
| Admin API | 30 | 1 min | userId |

### Gameplay Integrity

1. **Server-authoritative outcomes**: Client receives chart path and node positions but does NOT compute activation. Server pre-computes all node activations and emits events at correct timestamps.

2. **Seed commitment scheme**:
   ```
   Before round starts:
     seed = crypto.randomBytes(32).hex()
     commitment = SHA256(seed)
     → Publish commitment to clients

   After round resolves:
     → Reveal seed
     → Clients can verify: SHA256(revealed_seed) === commitment
     → Clients can regenerate round from seed to verify fairness
   ```

3. **Anti-tamper**: Round payloads signed with server HMAC. Any modification detectable.

4. **Replay verification**: Full replay data stored. Any round can be re-simulated from seed.

---

## 11. FRAUD / RISK ARCHITECTURE

### Risk Scoring Engine

```
┌──────────────────────────────────────────────────────┐
│                  RISK ENGINE                          │
│                                                      │
│  Input Signals                                       │
│  ┌────────────────────────────────────────────┐      │
│  │ • Device fingerprint (FingerprintJS Pro)   │      │
│  │ • IP address + geo + ISP                   │      │
│  │ • User agent + browser features            │      │
│  │ • Session creation patterns                │      │
│  │ • Wallet address graph                     │      │
│  │ • Bet timing patterns (ms precision)       │      │
│  │ • Bet amount patterns                      │      │
│  │ • Win/loss ratio anomalies                 │      │
│  │ • Withdrawal patterns                      │      │
│  │ • Login frequency + timing                 │      │
│  └────────────────────────────────────────────┘      │
│                       │                              │
│                       ▼                              │
│  ┌────────────────────────────────────────────┐      │
│  │           Rule Engine (configurable)       │      │
│  │                                            │      │
│  │  Rule: same_device_fingerprint             │      │
│  │    IF fingerprint matches other user        │      │
│  │    THEN +40 risk points                     │      │
│  │                                            │      │
│  │  Rule: rapid_bet_pattern                   │      │
│  │    IF >10 bets in 60s with <100ms gaps     │      │
│  │    THEN +60 risk points (bot suspect)       │      │
│  │                                            │      │
│  │  Rule: new_account_large_withdrawal        │      │
│  │    IF account < 24h AND withdrawal > $500  │      │
│  │    THEN +50 risk points                     │      │
│  │                                            │      │
│  │  Rule: shared_wallet_cluster               │      │
│  │    IF deposit wallet linked to >2 accounts │      │
│  │    THEN +70 risk points                     │      │
│  │                                            │      │
│  │  Rule: win_rate_anomaly                    │      │
│  │    IF win_rate > 80% over 50+ rounds       │      │
│  │    THEN +45 risk points                     │      │
│  └────────────────────────────────────────────┘      │
│                       │                              │
│                       ▼                              │
│  ┌────────────────────────────────────────────┐      │
│  │           Score Thresholds                 │      │
│  │                                            │      │
│  │  0-30:   Normal — no action                │      │
│  │  31-60:  Watch — log + flag for review     │      │
│  │  61-80:  Restrict — hold withdrawals       │      │
│  │  81-100: Block — suspend betting + alert   │      │
│  └────────────────────────────────────────────┘      │
│                       │                              │
│                       ▼                              │
│  ┌────────────────────────────────────────────┐      │
│  │           Actions                          │      │
│  │                                            │      │
│  │  • Create risk_flag record                 │      │
│  │  • Hold pending withdrawals                │      │
│  │  • Notify admin via dashboard + webhook    │      │
│  │  • Auto-restrict account (configurable)    │      │
│  │  • Queue for manual review                 │      │
│  └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

### Multi-Account Detection

```
Signals checked on every login + bet:

1. Device fingerprint match across accounts
2. IP address overlap (weighted by ISP type — datacenter IPs score higher)
3. Wallet address graph (shared deposit source)
4. Behavioral similarity (bet timing, amount patterns)
5. Browser fingerprint (canvas, WebGL, fonts)

Storage:
  device_fingerprints table: (fingerprint_hash, user_id, first_seen, last_seen)
  → Query: SELECT user_id FROM device_fingerprints WHERE fingerprint_hash = ? AND user_id != ?
  → If results: flag both accounts
```

### Withdrawal Risk Assessment

Every withdrawal gets a composite risk score:

```
withdrawal_risk_score = (
    account_age_factor      * 0.20 +   // new account = high
    verification_factor     * 0.15 +   // unverified = high
    deposit_withdrawal_ratio * 0.20 +  // deposit $10, withdraw $1000 = high
    fraud_flags_factor      * 0.25 +   // existing flags = high
    amount_factor           * 0.10 +   // large amount = higher
    velocity_factor         * 0.10     // many withdrawals recently = higher
)

Thresholds:
  < 0.3:  Auto-approve
  0.3-0.6: Auto-approve with logging
  0.6-0.8: Queue for review (24h SLA)
  > 0.8:  Hold + immediate admin alert
```

---

## 12. API DESIGN

### API Conventions

- **Base URL**: `https://api.tradingarena.gg/v1`
- **Auth**: Bearer token in `Authorization` header
- **Format**: JSON request/response
- **Errors**: Consistent error envelope: `{ error: { code: string, message: string, details?: unknown } }`
- **Pagination**: Cursor-based: `?cursor=xxx&limit=20`
- **Idempotency**: `Idempotency-Key` header for all POST mutations
- **Versioning**: URL path prefix `/v1/`

### Endpoint Catalog

```
AUTH API
────────────────────────────────────────────────────────
POST   /v1/auth/register              Create account (email + password)
POST   /v1/auth/login                 Email/password login
POST   /v1/auth/logout                Revoke session
POST   /v1/auth/refresh               Refresh token pair
GET    /v1/auth/wallet/challenge       Get wallet sign challenge
POST   /v1/auth/wallet/verify          Verify wallet signature + login
POST   /v1/auth/password/reset         Request password reset
POST   /v1/auth/password/confirm       Confirm password reset

USER API
────────────────────────────────────────────────────────
GET    /v1/users/me                    Get current user profile
PATCH  /v1/users/me                    Update profile (username, avatar, prefs)
GET    /v1/users/me/stats              Get gameplay statistics
GET    /v1/users/me/progression        Get level, XP, VIP tier, rakeback
GET    /v1/users/:id/profile           Get public profile

WALLET API
────────────────────────────────────────────────────────
GET    /v1/wallet/balances             Get all asset balances
GET    /v1/wallet/deposit/:asset       Get deposit address + instructions
POST   /v1/wallet/withdraw             Create withdrawal request
GET    /v1/wallet/transactions         List transaction history (paginated)
GET    /v1/wallet/linked               List linked wallets
POST   /v1/wallet/link                 Link new wallet address
DELETE /v1/wallet/link/:id             Unlink wallet

GAMEPLAY API
────────────────────────────────────────────────────────
GET    /v1/rounds/lobby                Get lobby state (next rounds, countdowns)
GET    /v1/rounds/next                 Get next available round
GET    /v1/rounds/:id                  Get round details
GET    /v1/rounds/:id/result           Get round result + replay data
POST   /v1/rounds/:id/bet             Place bet on round
DELETE /v1/rounds/:id/bet             Cancel bet (only if entry still open)
GET    /v1/rounds/history              Get user's round history (paginated)
GET    /v1/rounds/:id/replay           Get full replay payload

REWARDS API
────────────────────────────────────────────────────────
GET    /v1/rewards/missions            Get active missions + progress
POST   /v1/rewards/missions/:id/claim  Claim mission reward
GET    /v1/rewards/achievements        Get all achievements + unlock status
GET    /v1/rewards/rakeback            Get rakeback summary + claimable
POST   /v1/rewards/rakeback/claim      Claim accumulated rakeback

LEADERBOARD API
────────────────────────────────────────────────────────
GET    /v1/leaderboards/:type          Get leaderboard (type: volume, multiplier, streak)
                                       Query params: period=daily|weekly|seasonal, limit, cursor
GET    /v1/leaderboards/:type/me       Get current user's rank

SOCIAL API
────────────────────────────────────────────────────────
GET    /v1/feed/activity               Get global activity feed
GET    /v1/feed/personal               Get personalized feed

ADMIN API (requires admin role)
────────────────────────────────────────────────────────
GET    /v1/admin/rounds                List rounds with filters
PATCH  /v1/admin/rounds/config         Update round engine config
GET    /v1/admin/engine-config         Get current engine config
POST   /v1/admin/engine-config         Create new engine config version
PATCH  /v1/admin/engine-config/:id/activate  Activate config version
GET    /v1/admin/users                 Search/list users
GET    /v1/admin/users/:id             Get user detail (includes risk flags)
PATCH  /v1/admin/users/:id/status      Suspend/ban/activate user
GET    /v1/admin/transactions          List transactions with filters
GET    /v1/admin/withdrawals/pending   List pending withdrawal reviews
PATCH  /v1/admin/withdrawals/:id       Approve/reject withdrawal
GET    /v1/admin/risk/flags            List risk flags
PATCH  /v1/admin/risk/flags/:id        Resolve risk flag
GET    /v1/admin/feature-flags         List feature flags
PATCH  /v1/admin/feature-flags/:key    Toggle/update feature flag
GET    /v1/admin/audit-logs            Query audit logs
GET    /v1/admin/dashboard/stats       Get operational dashboard stats
```

### Request/Response Examples

```typescript
// POST /v1/rounds/:id/bet
// Request:
{
  "amount": 2500,            // $25.00 in cents
  "riskTier": "balanced",
  "idempotencyKey": "bet-abc123-round-xyz789"
}

// Response (201):
{
  "bet": {
    "id": "bet_abc123",
    "roundId": "round_xyz789",
    "amount": 2500,
    "fee": 75,               // 3% platform fee
    "riskTier": "balanced",
    "betSizeTier": "small",
    "status": "locked",
    "lockedAt": "2026-03-09T14:30:00.000Z"
  },
  "balance": {
    "available": 97425,
    "locked": 2575
  }
}

// Error (409 — duplicate):
{
  "error": {
    "code": "BET_ALREADY_PLACED",
    "message": "You already have a bet on this round"
  }
}

// Error (400 — insufficient):
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Available balance is insufficient for this bet"
  }
}
```

---

## 13. OBSERVABILITY PLAN

### Metrics (Prometheus + Grafana)

```
┌──────────────────────────────────────────────────────────────┐
│  BUSINESS METRICS                                            │
│                                                              │
│  tradingarena_active_users_total          gauge               │
│  tradingarena_rounds_started_total        counter             │
│  tradingarena_rounds_settled_total        counter             │
│  tradingarena_bets_placed_total           counter             │
│  tradingarena_bet_volume_cents_total      counter             │
│  tradingarena_payout_volume_cents_total   counter             │
│  tradingarena_platform_fee_cents_total    counter             │
│  tradingarena_deposits_total              counter (by status) │
│  tradingarena_withdrawals_total           counter (by status) │
│  tradingarena_new_users_total             counter             │
├──────────────────────────────────────────────────────────────┤
│  PERFORMANCE METRICS                                         │
│                                                              │
│  tradingarena_round_generation_ms         histogram           │
│  tradingarena_settlement_duration_ms      histogram           │
│  tradingarena_bet_placement_duration_ms   histogram           │
│  tradingarena_ws_message_latency_ms       histogram           │
│  tradingarena_api_request_duration_ms     histogram (by path) │
│  tradingarena_db_query_duration_ms        histogram           │
│  tradingarena_redis_op_duration_ms        histogram           │
│  tradingarena_deposit_confirmation_ms     histogram           │
│  tradingarena_withdrawal_processing_ms    histogram           │
├──────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE METRICS                                      │
│                                                              │
│  tradingarena_ws_connections_active       gauge               │
│  tradingarena_ws_messages_per_second      gauge               │
│  tradingarena_queue_depth                 gauge (by queue)    │
│  tradingarena_queue_processing_ms         histogram           │
│  tradingarena_dead_letter_count           counter             │
│  tradingarena_db_pool_active              gauge               │
│  tradingarena_db_pool_idle                gauge               │
│  tradingarena_redis_connected_clients     gauge               │
│  tradingarena_error_total                 counter (by type)   │
└──────────────────────────────────────────────────────────────┘
```

### Structured Logging (Pino)

```typescript
// Every log entry includes:
{
  level: 'info',
  time: 1709985600000,
  msg: 'Bet placed',
  correlationId: 'req_abc123',    // Propagated through entire request
  userId: 'user_xyz',
  roundId: 'round_789',
  betId: 'bet_456',
  amount: 2500,
  module: 'bet-service',
  env: 'production',
  version: '1.2.3',
}

// Log levels:
// fatal: System unusable (DB down, unrecoverable)
// error: Operation failed (settlement error, tx broadcast fail)
// warn:  Degraded but functional (cache miss, retry, risk flag)
// info:  Significant events (bet placed, round started, deposit confirmed)
// debug: Detailed flow (node activation, score calculation)
// trace: Very verbose (WebSocket messages, query plans) — disabled in prod
```

### Distributed Tracing

```
Trace: bet-to-settlement

Span: POST /v1/rounds/:id/bet  (API handler, 45ms)
  └─ Span: validate-balance    (wallet-service, 3ms)
  └─ Span: lock-funds          (wallet-service, 8ms)
       └─ Span: pg-transaction (db, 5ms)
  └─ Span: create-bet          (bet-service, 6ms)
       └─ Span: pg-insert      (db, 3ms)
  └─ Span: redis-publish       (ws-notify, 2ms)

Trace: round-settlement

Span: resolve-round            (round-engine, 120ms)
  └─ Span: compute-outcomes    (game-engine, 15ms)
  └─ Span: calculate-payouts   (payout-engine, 8ms)
  └─ Span: execute-settlements (payout-engine, 60ms)
       └─ Span: settle-user-1  (wallet-service, 12ms)
       └─ Span: settle-user-2  (wallet-service, 11ms)
       └─ ...
  └─ Span: award-xp            (rewards-service, 10ms)
  └─ Span: update-leaderboard  (leaderboard-service, 15ms)
  └─ Span: publish-results     (ws-broadcast, 5ms)
```

### Alert Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Settlement failed | settlement error count > 0 in 5min | Critical | PagerDuty + Slack |
| Balance mismatch | reconciliation delta != 0 | Critical | PagerDuty + Slack |
| Round generation failed | generation error > 0 | High | Slack |
| Deposit processor down | no deposits processed in 10min | High | Slack |
| Withdrawal stuck | withdrawal in 'processing' > 30min | High | Slack |
| WS connection spike | connections > 2x normal | Medium | Slack |
| API error rate | 5xx rate > 1% for 5min | High | Slack |
| Queue backlog | queue depth > 1000 | Medium | Slack |
| DB connection pool exhausted | pool_active = pool_max | High | Slack |
| Hot wallet low balance | balance < 24h projected withdrawals | High | Slack |

---

## 14. SCALABILITY ROADMAP

### Phase 1: Modular Monolith (0-1K concurrent users)

```
┌─────────────────────────┐
│    Single Deploy Unit   │
│                         │
│  API Server (Fastify)   │
│  + WebSocket Server     │
│  + Background Workers   │
│  + Queue Processor      │
│                         │
│  ┌───────┐ ┌───────┐   │
│  │ Redis │ │ PG    │   │
│  │(single│ │(single│   │
│  │ node) │ │ node) │   │
│  └───────┘ └───────┘   │
└─────────────────────────┘

Deployment: 1-2 containers
Workers: In-process or 1 dedicated worker container
Good for: MVP, beta testing, initial users
```

### Phase 2: Service Separation (1K-10K concurrent)

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ API Node │  │ API Node │  │ API Node │
│    #1    │  │    #2    │  │    #3    │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┼─────────────┘
                   │
            ┌──────▼──────┐
            │ Load Balancer│
            └──────┬──────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼────┐  ┌─────▼────┐  ┌─────▼────┐
│  WS GW │  │  WS GW   │  │  WS GW   │
│   #1   │  │   #2     │  │   #3     │
└───┬────┘  └─────┬────┘  └─────┬────┘
    │             │             │
    └─────────────┼─────────────┘
                  │
           ┌──────▼──────┐
           │ Redis Cluster│
           │  (3 nodes)   │
           └──────┬──────┘
                  │
    ┌─────────────┼──────────────┐
    │             │              │
┌───▼────┐ ┌─────▼─────┐ ┌─────▼─────┐
│ Worker │ │  Worker   │ │  Wallet   │
│ Pool   │ │  Pool     │ │  Service  │
│(settle │ │(leaderbd, │ │(isolated) │
│ ment)  │ │ rewards)  │ │           │
└────────┘ └───────────┘ └───────────┘
                  │
         ┌───────▼────────┐
         │  PostgreSQL     │
         │  Primary +      │
         │  Read Replica   │
         └─────────────────┘

Extracted services:
- WebSocket Gateway (dedicated, stateless via Redis PubSub)
- Wallet Service (isolated for security)
- Settlement Workers (dedicated compute)
- Leaderboard/Rewards Workers (background)
- Fraud Service (async scoring)
```

### Phase 3: Horizontal Scale (10K-100K+ concurrent)

```
Additional measures:
- PostgreSQL read replicas (2+) for read-heavy queries
- Redis Cluster (6+ nodes) for pubsub scale
- Partitioned workers by round/pool
- CDN for static assets + API caching
- Connection pooling (PgBouncer) for DB
- Regional deployment if latency-sensitive
- Separate analytics database (read replica or data warehouse)
- Rate limiting at edge (Cloudflare Workers)
```

### Key Scaling Decisions

| Bottleneck | Solution |
|-----------|----------|
| WebSocket fanout | Redis PubSub + multiple WS nodes |
| DB write contention | Optimistic locking + queue serialization for settlements |
| Leaderboard reads | Redis sorted sets + periodic PG snapshot |
| Round generation | Pre-generate N rounds ahead |
| Settlement throughput | Batch settlements per round, parallel user payouts |
| Deposit monitoring | Helius webhooks (push) instead of polling |

---

## 15. DEPLOYMENT PLAN

### Environment Strategy

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| Local | Development | Docker Compose (PG + Redis + app) |
| Staging | Pre-production testing | Identical to prod, smaller instances |
| Production | Live users | Full HA setup |

### Docker Compose (Local / Staging)

```yaml
# docker-compose.yml (simplified)
services:
  api:
    build: ./apps/api
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis]

  ws-gateway:
    build: ./apps/ws-gateway
    ports: ["3001:3001"]
    env_file: .env
    depends_on: [redis]

  workers:
    build: ./apps/workers
    env_file: .env
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: tradingarena
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
```

### CI/CD Pipeline

```
Push to main →
  1. Lint + type check
  2. Unit tests
  3. Integration tests (Docker Compose test env)
  4. Build Docker images
  5. Push to container registry
  6. Deploy to staging (auto)
  7. Smoke tests on staging
  8. Deploy to production (manual approval gate)
  9. Health check + rollback if unhealthy
```

### Production Infrastructure (Phase 1-2)

| Component | Service | Spec |
|-----------|---------|------|
| API + WS | Fly.io / Railway | 2-4 instances, 1GB RAM each |
| PostgreSQL | Neon / Supabase / RDS | 4GB RAM, 100GB storage |
| Redis | Upstash / ElastiCache | 1GB, cluster mode |
| Secrets | Doppler / Vault | Env var injection |
| CDN | Cloudflare | Static assets, DDoS protection |
| Monitoring | Grafana Cloud | Metrics + logs + traces |
| CI/CD | GitHub Actions | Build + test + deploy |
| Container Registry | GitHub Container Registry | Docker images |

### Database Migrations

```
Using Drizzle Kit:
- Migrations are version-controlled SQL files
- Applied automatically on deploy (before app starts)
- Rollback: each migration has an `up` and `down`
- Zero-downtime: migrations must be backwards-compatible
  (add column nullable first → deploy new code → backfill → add NOT NULL)
```

### Zero-Downtime Deploy

```
Rolling deploy strategy:
1. Start new instance with new code
2. Health check passes (DB connected, Redis connected, migrations applied)
3. Load balancer adds new instance
4. Old instance drains connections (30s grace period)
5. Old instance stops
6. Repeat for each instance

WebSocket handling:
- WS connections to old instance receive "reconnect" message
- Client auto-reconnects to new instance
- State recovered from Redis (active round snapshot)
```

---

## 16. TESTING STRATEGY

### Test Pyramid

```
                    ┌────────────┐
                    │   E2E      │  ~10 tests
                    │   Tests    │  Full user flows
                    ├────────────┤
                    │ Integration│  ~50 tests
                    │   Tests    │  Multi-module flows
                    ├────────────┤
                    │   Unit     │  ~300+ tests
                    │   Tests    │  Pure logic
                    └────────────┘
```

### Unit Tests

```
Framework: Vitest (fast, native TypeScript)

Game Engine:
  ✓ generateChartPath produces valid path within bounds
  ✓ generateNodes creates correct distribution per config
  ✓ multiplier formula: 1 + ((value - 1) * gainFactor * betFactor * bonus)
  ✓ divider formula: 1 + ((value - 1) * lossFactor * betFactor * penalty)
  ✓ shield absorption blocks divider correctly
  ✓ fake breakout boosts nearby divider activation by 15%
  ✓ volatility spike increases activation radius by 1.5x
  ✓ near-miss detection: activationRadius < distance <= nearMissRadius
  ✓ final multiplier clamped to [0, 50]
  ✓ deterministic: same seed = same round

Payout Engine:
  ✓ P2P pool: gross - fee = net
  ✓ band distribution: top 10% gets 50%, medium 20% gets 30%, etc.
  ✓ platform fee within configured range (2-4%)
  ✓ zero-player round: no division by zero
  ✓ single-player round: refund minus fee
  ✓ all players same score: equal distribution

Wallet / Ledger:
  ✓ lockFunds: available decreases, locked increases
  ✓ lockFunds insufficient: throws InsufficientBalance
  ✓ settlePayout: locked decreases, available increases by payout
  ✓ ledger entry created for every balance change
  ✓ balance_after matches actual balance
  ✓ concurrent locks: no negative balance (serializable tx)

Risk Scoring:
  ✓ new account + large withdrawal = high score
  ✓ shared device fingerprint = flag
  ✓ normal behavior = low score
  ✓ rule engine applies correct weights
```

### Integration Tests

```
Framework: Vitest + Testcontainers (real PG + Redis in Docker)

Bet-to-Settlement Flow:
  1. Create user with $100 balance
  2. Place $10 bet on round
  3. Verify balance: available=$90, locked=$10
  4. Generate and resolve round
  5. Verify settlement: locked=$0, payout credited
  6. Verify ledger entries: bet_lock + bet_settle + payout_credit
  7. Verify bet_results record created

Deposit Flow:
  1. Create deposit record
  2. Simulate confirmation webhook
  3. Verify balance credited
  4. Verify ledger entry
  5. Verify deposit status = confirmed

Withdrawal Flow:
  1. Create withdrawal request
  2. Verify funds locked
  3. Process approval
  4. Simulate broadcast + confirmation
  5. Verify funds released
  6. Verify ledger entries

WebSocket Event Delivery:
  1. Connect WebSocket client
  2. Subscribe to round topic
  3. Start round
  4. Verify events received in order: started → progress → frozen → resolved
  5. Verify payloads match expected structure
```

### E2E Tests

```
Framework: Playwright

Full User Journey:
  1. Register new account
  2. Connect wallet (mocked Phantom)
  3. Deposit $100 (mocked chain)
  4. Navigate to lobby
  5. Select $25 bet, balanced risk
  6. Click "Execute Round"
  7. Watch round play out (15s)
  8. Verify result screen shows correct data
  9. Verify balance updated
  10. Check leaderboard entry

Battle Mode:
  1. Two browser contexts (two users)
  2. Both join same battle round
  3. Round plays out
  4. Verify rankings shown correctly
  5. Verify payouts distributed per pool rules
```

### Property / Simulation Tests

```
Framework: fast-check (property-based testing)

Game Engine Properties:
  ∀ seed: generateRound(seed) produces valid round
  ∀ seed: nodes count within configured density range
  ∀ config: multiplier bands sum to 100 weight
  ∀ round: final multiplier ∈ [0, 50]
  ∀ round: activated + missed + near_miss = total nodes

Payout Properties:
  ∀ bets: sum(payouts) + fee = sum(bets)
  ∀ bets: no payout is negative
  ∀ bets: rank 1 payout >= rank 2 payout

Ledger Properties:
  ∀ operations: sum(ledger_entries) = current_balance
  ∀ operations: no entry without corresponding balance change
  ∀ operations: available + locked + pending >= 0 always

Monte Carlo Simulation:
  Run 100,000 rounds with random seeds
  ✓ Average house edge within configured range (2-8%)
  ✓ Multiplier distribution matches configured bands (χ² test)
  ✓ Near-miss rate within 30-45%
  ✓ No seed produces multiplier > 50
  ✓ P2P pool always sums correctly
```

---

## 17. FAILURE MODE HANDLING

### Critical Failure Scenarios

```
┌──────────────────────────────────────────────────────────────┐
│  FAILURE                      │  HANDLING                    │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  WebSocket disconnect during  │  Client auto-reconnects.     │
│  active round                 │  On reconnect, requests      │
│                               │  current round snapshot from │
│                               │  server. Catches up from     │
│                               │  current elapsed time.       │
│                               │  Result still delivered via  │
│                               │  REST fallback if WS fails.  │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Duplicate bet submission     │  Idempotency key on bets     │
│                               │  table (UNIQUE constraint).  │
│                               │  Client sends Idempotency-   │
│                               │  Key header. Second attempt  │
│                               │  returns existing bet.       │
│                               │  Redis lock prevents race.   │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Balance race condition       │  PostgreSQL SERIALIZABLE     │
│  (concurrent lock attempts)   │  isolation for balance ops.  │
│                               │  SELECT ... FOR UPDATE on    │
│                               │  balances row. Retry with    │
│                               │  backoff on serialization    │
│                               │  failure (max 3 retries).    │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Delayed deposit confirmation │  Deposit stays in            │
│                               │  'confirming' status.        │
│                               │  Background job retries      │
│                               │  confirmation check every    │
│                               │  10s for up to 10 minutes.   │
│                               │  After timeout: mark         │
│                               │  'failed', alert admin.      │
│                               │  User sees "pending" status. │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Failed withdrawal broadcast  │  Withdrawal stays in         │
│                               │  'processing' status.        │
│                               │  Retry broadcast 3x with     │
│                               │  exponential backoff.        │
│                               │  On persistent failure:      │
│                               │  mark 'failed', unlock       │
│                               │  funds back to available,    │
│                               │  alert admin, notify user.   │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Round settlement retry       │  Settlement uses distributed │
│                               │  lock (Redis) to prevent     │
│                               │  double-settle. Each payout  │
│                               │  is idempotent (check if     │
│                               │  bet_result exists before    │
│                               │  creating). Outbox pattern   │
│                               │  ensures retries are safe.   │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Leaderboard cache stale      │  Leaderboard reads from      │
│                               │  Redis sorted set. Updated   │
│                               │  on each round resolution.   │
│                               │  If Redis fails, fallback    │
│                               │  to PostgreSQL snapshot.     │
│                               │  Background job rebuilds     │
│                               │  from source every 5 min.    │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Admin misconfiguration       │  Engine config is versioned. │
│  (bad engine config)          │  New config activated by     │
│                               │  explicit action (not auto). │
│                               │  Validation runs before      │
│                               │  activation. Rollback =      │
│                               │  activate previous version.  │
│                               │  Each round stores           │
│                               │  config_snapshot at gen time. │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Database failover            │  Read replicas handle read   │
│                               │  traffic during primary      │
│                               │  failover. Write operations  │
│                               │  queue in BullMQ until       │
│                               │  primary recovers. Rounds    │
│                               │  pause if DB unavailable     │
│                               │  for >5s (safe stop).        │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Redis failure                │  Graceful degradation:       │
│                               │  - WS fanout: direct send    │
│                               │    (single-node fallback)    │
│                               │  - Leaderboard: PG fallback  │
│                               │  - Session cache: check DB   │
│                               │  - Rate limiting: disabled   │
│                               │    (accept all, log warning) │
│                               │  - Round state: PG fallback  │
│                               │  Alert immediately.          │
├───────────────────────────────┼──────────────────────────────┤
│                               │                              │
│  Replay regeneration mismatch │  Compare regenerated replay  │
│                               │  against stored events.      │
│                               │  If mismatch: flag round     │
│                               │  for admin review. Do NOT    │
│                               │  alter original results.     │
│                               │  Log detailed diff.          │
└───────────────────────────────┴──────────────────────────────┘
```

### Idempotency Rules

Every critical mutation must be idempotent:

```typescript
// Pattern: Check-then-act with unique constraint

async function settleBet(betId: string, payout: bigint): Promise<void> {
  // 1. Check if already settled
  const existing = await db.query.betResults.findFirst({
    where: eq(betResults.betId, betId)
  });
  if (existing) return; // Already settled — no-op

  // 2. Acquire distributed lock
  const lock = await redis.set(`lock:settle:${betId}`, '1', 'NX', 'EX', 30);
  if (!lock) return; // Another worker is handling this

  try {
    // 3. Execute in transaction
    await db.transaction(async (tx) => {
      // Create result (UNIQUE constraint on bet_id prevents duplicates)
      await tx.insert(betResults).values({ betId, ... });
      // Credit balance
      await walletService.settlePayout(userId, payout, { type: 'bet', id: betId });
    });
  } finally {
    await redis.del(`lock:settle:${betId}`);
  }
}
```

---

## 18. BALANCE MODEL — DETAILED

### Ledger-Based Balance System

Every balance change is recorded as an immutable ledger entry. The `balances` table is a materialized view that can be reconstructed from ledger entries.

```
┌──────────────────────────────────────────────────────────────┐
│  BALANCE STATES                                              │
│                                                              │
│  ┌──────────┐    lockFunds     ┌──────────┐                │
│  │AVAILABLE │ ──────────────►  │ LOCKED   │                │
│  │          │ ◄──────────────  │          │                │
│  └──────────┘   unlockFunds    └──────────┘                │
│       ▲                              │                      │
│       │ deposit confirmed            │ settle payout        │
│       │                              ▼                      │
│  ┌──────────┐                  ┌──────────┐                │
│  │ PENDING  │                  │ SETTLED  │ → available    │
│  │(deposits)│                  │          │                │
│  └──────────┘                  └──────────┘                │
│                                                             │
│  INVARIANT: available + locked + pending >= 0 ALWAYS        │
│  INVARIANT: sum(ledger_entries) = available + locked + pend │
└──────────────────────────────────────────────────────────────┘
```

### Bet Lifecycle — Balance Transitions

```
1. Bet Placed:
   available -= (amount + fee)
   locked    += (amount + fee)
   Ledger: { type: 'bet_lock', amount: -(amount+fee), ref: bet_id }

2a. Round Won (payout > bet):
   locked    -= (amount + fee)
   available += payout
   Ledger: { type: 'bet_settle', amount: -(amount+fee), ref: bet_id }
   Ledger: { type: 'payout_credit', amount: +payout, ref: round_id }

2b. Round Lost (payout < bet):
   locked    -= (amount + fee)
   available += payout
   Ledger: { type: 'bet_settle', amount: -(amount+fee), ref: bet_id }
   Ledger: { type: 'payout_credit', amount: +payout, ref: round_id }

3. Bet Cancelled (entry still open):
   locked    -= (amount + fee)
   available += (amount + fee)
   Ledger: { type: 'bet_unlock', amount: +(amount+fee), ref: bet_id }
```

### Concurrency Safety

```sql
-- Lock balance row before any modification
BEGIN;
  SELECT available_amount, locked_amount
  FROM balances
  WHERE user_id = $1 AND asset = $2
  FOR UPDATE;

  -- Check sufficient balance, perform mutation
  UPDATE balances SET available_amount = ..., locked_amount = ...;
  INSERT INTO balance_ledger_entries (...) VALUES (...);
COMMIT;
```

---

## 19. SUGGESTED PROJECT STRUCTURE

### Monorepo Layout

```
tradingarena/
├── package.json                    # Workspace root
├── turbo.json                      # Turborepo config
├── tsconfig.base.json
├── docker-compose.yml              # Local dev
├── docker-compose.test.yml         # Integration tests
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-staging.yml
│   └── deploy-production.yml
│
├── apps/
│   ├── web/                        # Frontend (React + Vite)
│   │   └── src/
│   │       ├── app/                # Shell (layout, routing)
│   │       ├── features/           # Domain modules
│   │       │   ├── auth/
│   │       │   ├── gameplay/
│   │       │   ├── wallet/
│   │       │   ├── social/
│   │       │   ├── rewards/
│   │       │   └── settings/
│   │       ├── shared/             # Design system, hooks, utils
│   │       └── types/
│   │
│   ├── api/                        # Backend API (Fastify)
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── middleware/         # Auth, rate limit, error handler
│   │       ├── routes/             # HTTP route handlers
│   │       └── modules/            # Domain modules
│   │           ├── auth/
│   │           ├── user/
│   │           ├── wallet/
│   │           ├── bet/
│   │           ├── round/
│   │           ├── game-engine/
│   │           ├── payout/
│   │           ├── rewards/
│   │           ├── leaderboard/
│   │           ├── feed/
│   │           ├── fraud/
│   │           └── admin/
│   │
│   ├── ws-gateway/                 # WebSocket server
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── gateway.ts
│   │       ├── auth.ts
│   │       ├── topics.ts
│   │       └── redis-adapter.ts
│   │
│   ├── workers/                    # Background job processors
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── settlement.worker.ts
│   │       ├── deposit.worker.ts
│   │       ├── withdrawal.worker.ts
│   │       ├── leaderboard.worker.ts
│   │       ├── rewards.worker.ts
│   │       ├── fraud.worker.ts
│   │       └── outbox.worker.ts
│   │
│   └── admin-panel/                # Admin dashboard
│
├── packages/                       # Shared packages
│   ├── shared-types/               # TS types across apps
│   ├── game-engine/                # Core engine (API + frontend)
│   └── db/                         # Drizzle schema + migrations
│
├── infra/
│   ├── docker/
│   ├── terraform/
│   └── k8s/                        # Phase 3
│
└── scripts/
    ├── seed-db.ts
    ├── simulate-rounds.ts          # Monte Carlo sim
    └── reconcile-balances.ts
```

---

## 20. RECOMMENDED IMPLEMENTATION PHASES

### Phase 1: Foundation (Weeks 1-4)

**Goal**: Working backend with auth, balances, and basic round execution.

| Week | Deliverables |
|------|-------------|
| 1-2 | Monorepo setup, PG schema + Drizzle, Redis, Fastify server, Auth module (email + JWT), User module, Balance/ledger module |
| 3 | Port game engine to shared package, Round scheduler (BullMQ), Round lifecycle state machine, Bet service, Payout engine (P2P), Settlement pipeline |
| 4 | WebSocket gateway, Redis PubSub, Round event broadcasting, Frontend WS client, Connect frontend to backend, Integration tests |

### Phase 2: Wallet + Security (Weeks 5-7)

**Goal**: Real money flow with Solana integration.

| Week | Deliverables |
|------|-------------|
| 5 | Wallet connect (Phantom), Wallet-based auth, Deposit address generation, Helius webhooks, Deposit confirmation + balance credit |
| 6 | Withdrawal pipeline, Risk scoring, Hot wallet signer (isolated), Tx broadcast + confirmation, Rate limiting, Input validation |
| 7 | Device fingerprinting, Risk rule engine, Multi-account detection, Observability (Pino + Prometheus), Alert rules |

### Phase 3: Social + Progression (Weeks 8-10)

**Goal**: Engagement features that drive retention.

| Week | Deliverables |
|------|-------------|
| 8 | XP awards, Level system, VIP tier calculation, Rakeback |
| 9 | Mission definitions, Progress tracking, Achievement unlocks, Reward claiming |
| 10 | Redis sorted set leaderboards, Daily/weekly/seasonal snapshots, Activity feed + WS broadcast |

### Phase 4: Battle Mode (Weeks 11-13)

**Goal**: Competitive multiplayer with real-time rankings.

| Week | Deliverables |
|------|-------------|
| 11 | Battle room creation, Player matching, Multi-player round execution, Live ranking broadcast |
| 12 | Pool-based payout with rankings, Battle result screen, Battle history + leaderboards |
| 13 | Disconnection recovery, Late join handling, Min player thresholds, Battle missions |

### Phase 5: Admin + Production (Weeks 14-16)

**Goal**: Operational readiness for launch.

| Week | Deliverables |
|------|-------------|
| 14 | Admin dashboard, Engine config management (versioned), User/withdrawal/fraud review queues, Audit logs |
| 15 | Full observability, Load testing (1000 concurrent), Security audit, Penetration testing, Balance reconciliation |
| 16 | Staging mirror, CI/CD finalized, Rollback + backup tested, API docs + runbooks, On-call setup |

### Phase 6: Scale + Evolve (Post-Launch)

- Monitor and optimize bottlenecks
- Extract wallet service, WS gateway
- Add PG read replicas
- Implement hybrid liquidity mode
- Seasonal content (missions, achievements)
- Mobile app (React Native, shared game engine)

---

## APPENDIX: CRITICAL SYSTEM PRINCIPLES

1. **Round logic is deterministic and server-authoritative.** Given a seed + config, any node can reproduce the exact same round. Clients render — they do not decide outcomes.

2. **Financial state is ledger-safe and auditable.** Every cent moved produces an immutable ledger entry. Balances can be reconstructed from the ledger at any time.

3. **Realtime UX is smooth and trustworthy.** Sub-100ms WebSocket updates. Reconnection recovers state. Timing is server-driven.

4. **Security and wallet operations are robust.** Private keys never in app memory. Withdrawals have risk scoring + approval gates.

5. **The architecture evolves without rewrites.** P2P → hybrid → house liquidity is a config change. Modular boundaries enable service extraction. Domain events enable new consumers without modifying producers.

---

*Architecture document v1.0 — March 2026*
*Designed for Trading Arena production platform*
