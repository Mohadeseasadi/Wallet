# AGENTS.md

## 1. PROJECT

This repository contains a production-oriented **Financial Wallet Backend**.

The purpose of this project is not to build a simple CRUD wallet.
It is designed to demonstrate the engineering principles required for reliable financial systems:

* financial correctness
* transactional consistency
* concurrency control
* idempotency
* failure recovery
* double-entry accounting
* auditability
* testability
* maintainable architecture
* production readiness

### Stack

* Node.js
* TypeScript
* Express
* PostgreSQL
* Sequelize
* Docker

Technology choices are driven by project requirements and may change only through an explicit architectural decision.

---

# 2. CORE BUSINESS

### Currency

The system currently supports **IRR only**.

Never use floating-point numbers for monetary calculations.

Money must be represented using integer values.

### User / Wallet

* Each user has exactly one wallet.
* A wallet contains:

  * `balance`
  * `reservedBalance`
  * `status`
* Conceptually:

`availableBalance = balance - reservedBalance`

`availableBalance` must never become negative.

### Operations

The wallet currently supports:

* deposit
* withdrawal
* internal user-to-user transfer

Transfers occur only between users inside the same system.

---

# 3. FINANCIAL MODEL

Financial correctness is the highest priority.

Every financial operation must explicitly consider:

1. Atomicity
2. Consistency
3. Isolation / concurrency
4. Idempotency
5. Failure recovery
6. Ledger integrity
7. Auditability

A financial operation must never partially succeed.

If a database transaction fails, all related financial changes must be rolled back.

---

# 4. DOUBLE-ENTRY LEDGER

Double-entry accounting is mandatory.

Every completed financial movement must result in balanced ledger entries.

The ledger is the **accounting source of truth**.

Wallet balance is a materialized/current representation used for efficient access.

Ledger history is immutable.

Never modify or bypass historical ledger entries to "fix" a balance.

If a financial discrepancy occurs, investigate and reconcile it instead of mutating historical accounting records.

---

# 5. TRANSACTIONS

A business transaction represents the lifecycle of a financial operation.

A transaction is different from:

* wallet balance
* ledger entries
* request logs
* audit records

These concepts must not be unnecessarily merged.

### Current transaction lifecycle

```text
PENDING
   ↓
PROCESSING
   ↓
SUCCESS

PROCESSING
   ↓
FAILED
```

Do not introduce new states such as `REVERSED`, `REFUNDED`, etc. unless a real business requirement requires them.

Refunds and reversals are currently out of scope.

State transitions must be explicit and validated.

Invalid state transitions must be rejected.

---

# 6. CONCURRENCY

The system must prevent:

* double spending
* negative available balance
* inconsistent wallet balances
* duplicated financial operations
* race conditions between concurrent requests

PostgreSQL transactions and row-level locking should be used where required.

When multiple wallets must be locked in the same operation, use a deterministic lock order to reduce deadlock risk.

Never assume that checking a balance before starting a transaction is sufficient.

Financial invariants must be protected at the database/transaction level.

---

# 7. RESERVED BALANCE

Reserved balance exists to represent money committed to an in-flight operation.

For example, during a withdrawal:

```text
balance = 1,000,000
reservedBalance = 300,000

availableBalance = 700,000
```

The reserved amount must not be available for another outgoing operation.

Reservation and release must be atomic and recoverable.

A failed operation must not leave money permanently reserved.

---

# 8. IDEMPOTENCY

Financial commands must be idempotent whenever duplicate execution could cause financial harm.

The system must handle:

* client retries
* duplicate HTTP requests
* worker retries
* duplicate provider callbacks
* network timeouts
* requests where the client does not know whether the operation succeeded

An idempotency key must not simply prevent duplicate HTTP responses.

It must protect the underlying financial operation.

Idempotency records/results must be persisted durably.

Database uniqueness constraints should be used where appropriate.

---

# 9. EXTERNAL OPERATIONS

Deposits and withdrawals may interact with an external-like payment/provider system.

The provider must be accessed through an abstraction/port.

The domain must not depend directly on a concrete provider implementation.

A mock provider is acceptable for this project.

Never keep a PostgreSQL transaction open while waiting for an external provider/network response.

External operations must be designed around:

* durable transaction state
* idempotency
* retries
* provider reference IDs
* failure handling
* recovery
* reconciliation

The system must be able to determine what happened after a network interruption.

---

# 10. FEES AND TAXES

Fees and taxes are dynamic.

They are stored/configured in the database and may change over time.

The fee/tax actually applied to a transaction must be persisted with that transaction.

Changing the current fee/tax configuration must never change historical transactions.

Do not calculate historical transactions using today's configuration.

Do not use floating-point arithmetic for financial percentages where precision matters.

---

# 11. WALLET FREEZING

Wallets can be frozen by an administrator.

A frozen wallet:

* can still be viewed
* cannot initiate new outgoing financial operations

Incoming operations may still be allowed unless a concrete business requirement states otherwise.

Existing in-flight operations must be handled according to their transaction state rather than being silently cancelled.

---

# 12. ROLES

At minimum:

```text
USER
ADMIN
```

Admin capabilities include operational access to:

* users
* wallets
* transactions
* ledger information
* fees/taxes
* wallet freezing

Authorization must be enforced at the application boundary.

Do not rely only on hiding API endpoints from the UI.

---

# 13. ARCHITECTURE

Current architectural direction:

**Modular Monolith + Hexagonal / Ports & Adapters + Domain-oriented design**

The architecture should separate:

### Domain

Pure business concepts and rules.

The domain should not depend on:

* Express
* Sequelize
* PostgreSQL
* Redis
* queues
* HTTP
* external providers

### Application

Use cases and application orchestration.

Examples:

* CreateDeposit
* Withdraw
* Transfer
* FreezeWallet
* GetTransaction

Use cases coordinate domain behavior and infrastructure through abstractions.

### Infrastructure

Concrete implementations of external concerns:

* Sequelize repositories
* PostgreSQL
* payment provider
* queue
* cache
* external services

### Interface / HTTP

Express controllers, routes, request validation and HTTP-specific concerns.

---

# 14. DEPENDENCY RULE

Dependencies must point inward.

```text
HTTP / Infrastructure
        ↓
    Application
        ↓
      Domain
```

The domain must not import infrastructure.

For example, this is forbidden:

```text
Domain → Sequelize
Domain → Express
Domain → PostgreSQL
```

Instead:

```text
Application → Repository Interface
Infrastructure → Repository Implementation
```

---

# 15. REPOSITORIES

Repositories are abstractions around persistence.

Business logic must not directly perform Sequelize queries.

Prefer:

```text
WalletRepository
TransactionRepository
LedgerRepository
UserRepository
```

over putting database queries inside use cases.

Repository interfaces belong to the appropriate inner layer.

Sequelize implementations belong to infrastructure.

---

# 16. DATABASE TRANSACTIONS

Any operation that changes multiple related financial records must execute atomically.

For example, a transfer may involve:

```text
Sender Wallet
Receiver Wallet
Transaction
Ledger Entries
Idempotency Record
```

The exact set depends on the use case.

These changes must be consistent with one database transaction where they represent one atomic business operation.

Do not introduce distributed transactions without a concrete requirement.

---

# 17. OUTBOX / ASYNC PROCESSING

The financial core must remain transactionally safe.

Queues are useful for asynchronous work such as:

* external provider processing
* retries
* notifications
* reconciliation
* post-commit events
* integrations

Do not move the actual financial invariant into an unreliable asynchronous workflow merely because a queue is available.

If database state and event publishing must remain consistent, consider the **Transactional Outbox Pattern**.

Do not introduce Kafka, RabbitMQ, Redis/BullMQ, or another queue technology without identifying the actual requirement it solves.

---

# 18. AUDITABILITY

The system must be able to answer:

* Who initiated an operation?
* What operation was requested?
* When was it requested?
* What transaction was created?
* What financial changes occurred?
* What ledger entries were created?
* What external provider reference was involved?
* What was the final state?
* What happened if the request failed or timed out?

Keep these concepts separate:

```text
Request / Application Logs
Financial Transaction
Ledger
Audit Log
```

Do not use logs as the financial source of truth.

---

# 19. RECONCILIATION

The system should support reconciliation between:

```text
Wallet materialized balance
        ↕
Ledger-derived balance
        ↕
External provider records
```

Reconciliation is a safety mechanism, not a replacement for transactional correctness.

If reconciliation detects a discrepancy, historical financial records must not simply be edited.

---

# 20. TESTING

Testing is a first-class requirement.

Tests must verify business behavior and financial invariants, not only HTTP status codes.

Important scenarios include:

* successful deposit
* successful withdrawal
* successful transfer
* insufficient balance
* concurrent withdrawals
* concurrent transfers
* duplicate requests
* duplicate provider callbacks
* idempotency
* rollback
* failed external operation
* reservation release
* invalid transaction state transition
* frozen wallet
* balanced ledger
* fee/tax calculation
* historical fee/tax consistency

Concurrency and failure scenarios are especially important.

---

# 21. DEVELOPMENT WORKFLOW

Before implementing a non-trivial feature:

### Step 1 — Understand

Inspect:

* existing modules
* domain model
* use cases
* repositories
* database models
* tests
* current architecture
* existing decisions

Do not start coding immediately.

### Step 2 — Analyze

Identify:

* affected domain concepts
* affected use cases
* database changes
* transaction boundaries
* concurrency risks
* idempotency requirements
* failure scenarios
* external dependencies
* testing requirements

### Step 3 — Design

Propose the smallest architectural change that satisfies the requirement.

If the requirement conflicts with an existing decision, explicitly identify the conflict.

### Step 4 — Implement

Implement consistently with the existing architecture.

Do not introduce unnecessary abstractions or dependencies.

### Step 5 — Test

Add or update tests for:

* happy path
* invalid input
* business rules
* financial invariants
* concurrency
* failure/retry behavior where relevant

### Step 6 — Review

Before finishing, verify:

* architecture was preserved
* financial invariants are preserved
* no duplicate financial operation is possible
* transaction boundaries are correct
* error handling is correct
* tests pass
* documentation/decision records are updated if necessary

---

# 22. AI BEHAVIOR

The AI is not the owner of the architecture.

The AI acts as:

* coding assistant
* reviewer
* architecture reviewer
* debugging partner
* test-writing assistant
* technical decision advisor

The AI must preserve existing decisions unless there is a justified reason to change them.

### The AI MUST NOT silently:

* change the architecture
* replace the ORM
* replace PostgreSQL
* introduce microservices
* introduce a queue
* change the ledger model
* change money representation
* change transaction states
* change authentication strategy
* change financial invariants
* add major dependencies

If a major change is necessary:

1. explain why
2. identify the affected decision
3. present alternatives
4. explain trade-offs
5. wait for approval before making the architectural change

---

# 23. WHEN REQUIREMENTS ARE AMBIGUOUS

Never invent important financial business rules.

If a requirement is ambiguous:

```text
Do not guess → identify ambiguity → propose options → explain trade-offs → ask for a decision
```

For minor implementation details, use the existing project conventions.

For business or architectural decisions, ask.

---

# 24. DEFINITION OF DONE

A feature is not complete merely because the endpoint works.

A financial feature is complete when:

* business behavior is correct
* domain rules are enforced
* database changes are consistent
* transaction boundaries are correct
* concurrency is considered
* idempotency is considered
* failure scenarios are considered
* ledger integrity is preserved
* tests cover important scenarios
* authorization is correct
* existing architecture is preserved
* no unexplained architectural decision was introduced

---

# 25. CURRENT SCOPE

### In scope

* Authentication
* User management
* Wallet management
* Deposit
* Withdrawal
* Internal transfer
* Double-entry ledger
* Dynamic fees/taxes
* Idempotency
* Concurrency control
* Transaction lifecycle
* Admin operations
* Wallet freezing
* Auditability
* Reconciliation
* Testing
* Docker
* CI/CD
* Production observability

### Currently out of scope

* Refunds
* Reversals
* Multi-currency
* International transfers
* Overdraft
* Merchant payment system
* Real banking/payment gateway integration

Do not add out-of-scope functionality without an explicit decision.

---

# 26. FINAL PRINCIPLE

When choosing between:

```text
quick implementation
```

and

```text
financial correctness
```

choose financial correctness.

When choosing between:

```text
more abstraction
```

and

```text
simple architecture that satisfies the requirement
```

choose the simplest architecture that correctly solves the problem.

Every new feature must fit the existing system rather than forcing the existing system to fit the feature.
