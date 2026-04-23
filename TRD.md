# Technical Requirements Document

## Time-Off Microservice

**ExampleHR Platform - Balance Lifecycle & HCM Synchronization**

| Field      | Detail                                                |
| ---------- | ----------------------------------------------------- |
| Author     | Eduardo da Cruz Pimentel                              |
| Version    | 1.0 - Initial Draft                                   |
| Date       | April 2026                                            |
| Status     | Ready for Review                                      |
| Tech Stack | NestJS · SQLite · TypeScript · Jest                   |
| Scope      | Time-Off Microservice (balance management + HCM sync) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Technical Challenges](#3-technical-challenges)
4. [Data Model](#4-data-model)
5. [Proposed Solution](#5-proposed-solution)
6. [API Contract](#6-api-contract)
7. [Alternatives Considered](#7-alternatives-considered)
8. [Test Strategy](#8-test-strategy)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Out of Scope](#10-out-of-scope)

---

## 1. Executive Summary

ExampleHR provides employees with a dedicated interface to request and manage time off. However, the Human Capital Management (HCM) system, the authoritative source of record for employment data, operates independently. This creates a distributed consistency problem: two systems must agree on leave balances at all times, even when either can change those balances autonomously.

This document specifies the architecture, data model, API contract, and testing strategy for the **Time-Off Microservice**, a dedicated backend service responsible for managing the full lifecycle of a time-off request and ensuring reliable synchronization with the HCM.

> **Core Design Principle:** The HCM is always the source of truth. ExampleHR never assumes its local balance is correct without HCM confirmation. Every state transition in a time-off request is designed to be safe under partial failure, retried deterministically, and auditable after the fact.

---

## 2. Problem Statement

### 2.1 Context

ExampleHR is a platform that mediates between employees and the HCM. The HCM holds the ground truth for all leave balances (days available per employee per location), while ExampleHR provides a better user experience: instant feedback, approval workflows, and a centralized history of requests.

The fundamental tension is that **both systems can write to the balance independently**:

- ExampleHR writes when an employee submits or cancels a request.
- The HCM writes when a work anniversary occurs, a new policy year starts, or an HR administrator manually adjusts a balance.

This means ExampleHR's local cache of balances can become stale at any moment, without warning. The HCM remains the authoritative source of truth for all balance data, any discrepancy between ExampleHR and the HCM must always be resolved in the HCM's favor.

### 2.2 User Personas

| Persona  | Need                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Employee | Wants to see an accurate balance and get instant feedback on requests.                                        |
| Manager  | Needs to approve requests knowing the displayed balance is valid and the underlying HCM data is in agreement. |

> **Note:** The HCM is not a user persona, it is an external system. Its role as the authoritative source of truth is addressed in Section 2.1 and governs all synchronization decisions described in Section 5.

---

## 3. Technical Challenges

The following challenges were identified as the core engineering problems this service must solve. Each one informed a specific design decision described in Section 5.

### 3.1 Distributed State Consistency

ExampleHR and the HCM maintain independent copies of leave balances. Since the HCM can update balances without notifying ExampleHR (e.g. work anniversaries, year-start refreshes), ExampleHR's local state can become silently stale. Serving a stale balance to an employee or manager is a correctness failure.

### 3.2 Unreliable HCM Error Responses

The exercise explicitly warns that HCM error responses, such as insufficient balance or invalid dimension combinations, are not guaranteed. The service must not rely solely on the HCM to reject invalid requests. **Local defensive validation is mandatory.**

### 3.3 Idempotency Under Retries

Network failures can cause a client to retry a request that already succeeded on the server. Without idempotency controls, a retry could double-debit a balance. Every state-mutating operation must be safe to execute more than once with the same outcome.

### 3.4 Race Conditions on Balance Deduction

Two concurrent requests from the same employee could both read a balance of 5 days and both proceed to debit 3 days, resulting in a balance of -1. Without optimistic or pessimistic locking, this is a silent data corruption. The service must serialize writes to the same employee-location balance.

### 3.5 Partial HCM Sync Failures

The HCM provides a batch endpoint to push the full corpus of balances. If this import fails midway, the local database may be left in a partially updated state, some balances new, some stale. The import must be **transactional: all-or-nothing**.

### 3.6 Approval Workflow Atomicity

When a manager approves a request, three things must happen in sequence: (1) local status update, (2) balance deduction in local DB, (3) HCM deduction via API. If steps 1 and 2 succeed but step 3 fails, ExampleHR and HCM are out of sync. The service must handle this with a retry mechanism and, if unrecoverable, flag the request for manual reconciliation.

---

## 4. Data Model

The service uses SQLite with three core tables. All balances are scoped **per employee per location**, as specified in the requirements.

### 4.1 `leave_balance`

Stores the local cached copy of each employee's leave balance per location. Synchronized from the HCM via real-time API or batch import.

| Column           | Type             | Description                                                   |
| ---------------- | ---------------- | ------------------------------------------------------------- |
| `id`             | INTEGER PK       | Auto-incremented primary key                                  |
| `employee_id`    | TEXT NOT NULL    | External identifier from the HCM                              |
| `location_id`    | TEXT NOT NULL    | Leave policy location scoping                                 |
| `leave_type`     | TEXT NOT NULL    | e.g. `VACATION`, `SICK`, `PERSONAL`                           |
| `available_days` | REAL NOT NULL    | Current balance (may be fractional)                           |
| `version`        | INTEGER NOT NULL | Optimistic lock counter - increments on every write           |
| `last_synced_at` | DATETIME         | Timestamp of last successful HCM sync                         |
| UNIQUE           | —                | `(employee_id, location_id, leave_type)` enforced at DB level |

### 4.2 `time_off_request`

Tracks the full lifecycle of each time-off request with a state machine enforced at the application layer.

| Column            | Type          | Description                                          |
| ----------------- | ------------- | ---------------------------------------------------- |
| `id`              | TEXT PK       | UUID v4 - serves as idempotency key                  |
| `employee_id`     | TEXT NOT NULL | Reference to HCM employee                            |
| `location_id`     | TEXT NOT NULL | Scoping dimension                                    |
| `leave_type`      | TEXT NOT NULL | Must match an existing `leave_balance` row           |
| `days_requested`  | REAL NOT NULL | Number of days being requested                       |
| `status`          | TEXT NOT NULL | `PENDING` \| `APPROVED` \| `REJECTED` \| `CANCELLED` |
| `hcm_sync_status` | TEXT NOT NULL | `PENDING` \| `SYNCED` \| `FAILED` \| `RETRY`         |
| `idempotency_key` | TEXT UNIQUE   | Client-supplied key to prevent duplicate submissions |
| `created_at`      | DATETIME      | Request creation timestamp                           |
| `updated_at`      | DATETIME      | Last status change timestamp                         |

### 4.3 `sync_audit_log`

Immutable append-only log of every HCM synchronization event. Used for debugging, reconciliation, and compliance.

| Column          | Type          | Description                                                            |
| --------------- | ------------- | ---------------------------------------------------------------------- |
| `id`            | INTEGER PK    | Auto-incremented                                                       |
| `event_type`    | TEXT NOT NULL | `REALTIME_SYNC` \| `BATCH_SYNC` \| `APPROVAL_DEBIT` \| `CANCEL_CREDIT` |
| `employee_id`   | TEXT          | Affected employee (nullable for full batch events)                     |
| `location_id`   | TEXT          | Affected location                                                      |
| `payload`       | TEXT          | JSON blob of the operation payload                                     |
| `result`        | TEXT NOT NULL | `SUCCESS` \| `FAILURE`                                                 |
| `error_message` | TEXT          | HCM error detail if result is `FAILURE`                                |
| `created_at`    | DATETIME      | Event timestamp                                                        |

---

## 5. Proposed Solution

### 5.1 Architecture Overview

The service is a standalone NestJS application following a layered architecture:

```
HTTP Layer (Controllers)
    ↓
Business Logic (Services)
    ↓
Data Access (Repositories via TypeORM + SQLite)
    ↓
External Integration (HcmClient)
```

Controllers handle HTTP concerns only. Services contain all business logic. Repositories abstract database access. The HCM is accessed exclusively through a dedicated `HcmClientModule` that centralizes all outbound communication, retries, and error normalization.

### 5.2 Module Structure

| Module            | Responsibility                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| `TimeOffModule`   | Core domain: request creation, state machine transitions, balance deduction.   |
| `BalanceModule`   | Manages the `leave_balance` table. Exposes balance query and sync endpoints.   |
| `HcmClientModule` | Encapsulates all outbound HTTP calls to the HCM. Handles retries and timeouts. |
| `SyncModule`      | Processes batch imports from HCM. Runs transactionally; logs to audit table.   |
| `AuditModule`     | Writes to `sync_audit_log`. Used by all other modules for observability.       |

### 5.3 Request Lifecycle & State Machine

Every time-off request transitions through the following states. Invalid transitions are rejected at the service layer before any database write occurs.

```
                    ┌─────────────┐
                    │   PENDING   │
                    └──────┬──────┘
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       APPROVED         REJECTED       CANCELLED
            │
            ▼
       CANCELLED  (balance credited back, HCM notified)
```

| From       | To          | Trigger & Conditions                                                    |
| ---------- | ----------- | ----------------------------------------------------------------------- |
| (none)     | `PENDING`   | Employee submits. Local balance check passes. Idempotency key stored.   |
| `PENDING`  | `APPROVED`  | Manager approves. Re-validates balance. Deducts locally. Syncs to HCM.  |
| `PENDING`  | `REJECTED`  | Manager rejects. No balance change.                                     |
| `PENDING`  | `CANCELLED` | Employee cancels. No balance change.                                    |
| `APPROVED` | `CANCELLED` | Employee cancels approved request. Balance credited back. HCM notified. |

### 5.4 Balance Integrity Strategy

Two complementary mechanisms protect balance correctness:

**Optimistic Locking:** The `leave_balance` table has a `version` column. Every `UPDATE` includes a `WHERE version = :current_version` clause. If the update affects 0 rows, the service retries with a fresh balance read. This prevents concurrent writes from silently corrupting data.

**Pre-Approval HCM Re-validation:** At approval time, the service fetches the current balance directly from the HCM real-time API before deducting. This ensures the most recent balance, including any anniversary credits or admin adjustments, is honored.

### 5.5 HCM Synchronization Strategy

Two synchronization paths are supported:

**Real-time Sync (per request)**

- Triggered at balance query time and at approval time.
- Calls the HCM real-time API for a specific `employee_id` + `location_id` combination.
- Updates the local `leave_balance` row and refreshes `last_synced_at`.
- Logs the result to `sync_audit_log`.

**Batch Sync (full corpus)**

- Triggered by an authenticated internal endpoint (e.g. called by a scheduled job or HCM webhook).
- Receives the full payload from the HCM batch endpoint.
- Executes within a **single database transaction**: all-or-nothing.
- Upserts each balance row (`INSERT OR REPLACE` with version reset).
- If the transaction fails, the database is rolled back to its prior state and the failure is logged.

### 5.6 Idempotency

Clients must supply an `Idempotency-Key` header on all `POST` requests. If a request with that key already exists in the database, the service returns the original response without re-executing the operation. This makes retries safe under any network failure scenario.

### 5.7 Defensive Validation

Because HCM error responses are not guaranteed, all balance checks are performed locally before any HCM call is made:

- `days_requested` must be a positive number greater than zero.
- The `employee_id` + `location_id` + `leave_type` combination must exist in `leave_balance`.
- `available_days` must be `>= days_requested` at the time of the local check.
- If the HCM returns an error during approval, the local deduction is rolled back and the request is returned to `PENDING` with `hcm_sync_status = FAILED`.

---

## 6. API Contract

All endpoints are prefixed with `/api/v1`. Authentication is assumed to be handled by an upstream API gateway; the service trusts the `employee_id` provided in authenticated requests.

| Method  | Endpoint                            | Description                                                             |
| ------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `GET`   | `/balances/:employeeId`             | Fetch all balances for an employee. Triggers real-time HCM sync first.  |
| `GET`   | `/balances/:employeeId/:locationId` | Fetch balance for a specific employee + location.                       |
| `POST`  | `/sync/batch`                       | Ingest full HCM balance corpus. Transactional upsert. Internal only.    |
| `POST`  | `/requests`                         | Create a time-off request. Requires `Idempotency-Key` header.           |
| `GET`   | `/requests/:id`                     | Fetch a single request by UUID.                                         |
| `GET`   | `/requests?employeeId=&status=`     | List requests for an employee, optionally filtered by status.           |
| `PATCH` | `/requests/:id/approve`             | Manager approves. Re-validates balance, deducts, syncs to HCM.          |
| `PATCH` | `/requests/:id/reject`              | Manager rejects. No balance change.                                     |
| `PATCH` | `/requests/:id/cancel`              | Employee cancels. If `APPROVED`, credits balance back and notifies HCM. |
| `GET`   | `/audit?employeeId=&from=&to=`      | Query the `sync_audit_log` for observability and reconciliation.        |

---

## 7. Alternatives Considered

### 7.1 Always-Fetch from HCM (No Local Cache)

Every balance query would call the HCM real-time API directly, eliminating stale data entirely.

|                  |                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **Advantage**    | Zero stale data risk. No synchronization logic needed.                                                      |
| **Disadvantage** | Full HCM dependency. Any HCM downtime makes ExampleHR unavailable. Latency added to every user interaction. |

**Decision:** Rejected in favor of a local cache with explicit sync points.

---

### 7.2 Event-Driven Sync via Message Queue

Publish balance change events to a queue (e.g. RabbitMQ); a consumer updates ExampleHR asynchronously.

|                  |                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Advantage**    | Decoupled, scalable, and resilient to transient failures.                                                                                 |
| **Disadvantage** | Adds infrastructure complexity (message broker, consumer service, dead-letter queues). Disproportionate for a microservice at this scale. |

**Decision:** Rejected in favor of synchronous HCM calls with retry logic.

---

### 7.3 Pessimistic Locking for Race Conditions

Use `SELECT FOR UPDATE` to lock the balance row during the approval flow.

|                  |                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Advantage**    | Guaranteed serialization with no retry logic needed.                                                    |
| **Disadvantage** | SQLite does not support `SELECT FOR UPDATE`. Even in PostgreSQL, it can cause lock contention at scale. |

**Decision:** Rejected. Optimistic locking with retry was chosen as the portable and performant alternative.

---

### 7.4 GraphQL instead of REST

Expose a GraphQL API for flexible client-driven querying.

|                  |                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Advantage**    | Flexible queries; reduced over-fetching.                                                                                                |
| **Disadvantage** | Additional complexity in resolver design and N+1 protection. REST is sufficient and better understood by the HCM integration landscape. |

**Decision:** Rejected.

---

## 8. Test Strategy

Given that the exercise explicitly states that **the value of the submission lies in the rigor of the tests**, the following strategy prioritizes failure-path coverage and integration with a realistic HCM mock server.

### 8.1 Test Layers

| Layer             | Framework             | Purpose                                                                                         |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| Unit Tests        | Jest                  | Pure business logic: state machine transitions, balance calculations, validation rules. No I/O. |
| Integration Tests | Jest + Supertest      | Full HTTP request/response cycle against an in-memory SQLite DB and a mock HCM server.          |
| Mock HCM Server   | NestJS (separate app) | Simulates HCM real-time API and batch endpoint with configurable failure behaviors.             |

### 8.2 Critical Test Scenarios

#### Balance Integrity

- **Happy path:** employee submits request, manager approves, balance decreases by the correct amount.
- **Concurrent approval:** two simultaneous approval requests for the same employee, only one succeeds; the other retries and finds insufficient balance.
- **HCM anniversary credit:** HCM increases balance mid-workflow, subsequent approval uses the updated balance.
- **Stale local balance:** local DB shows 5 days, HCM real-time returns 2 days, approval is correctly rejected.

#### Idempotency

- Submitting the same request twice with the same `Idempotency-Key` returns the original response without creating a second record.
- Retrying an approval that already succeeded does not double-debit the balance.

#### HCM Failure Handling

- **HCM real-time API is down:** balance query returns locally cached value with a staleness warning in the response.
- **HCM returns error on approval debit:** local deduction is rolled back, request remains `PENDING`, `hcm_sync_status = FAILED`.
- **Network timeout after HCM success:** idempotent retry resolves correctly without double-debit.

#### Batch Sync

- Full batch import succeeds: all balances updated atomically.
- Batch import fails midway: database rolls back, no partial state persisted.
- Batch import with a new employee: creates a new `leave_balance` row correctly.

#### State Machine

- Attempting to approve a `REJECTED` request returns `409 Conflict`.
- Attempting to cancel an already `CANCELLED` request is a no-op (idempotent).
- Attempting to approve a request with 0 available days returns `422 Unprocessable Entity`.

### 8.3 Mock HCM Server Behaviors

The mock server exposes a control endpoint (`POST /hcm-mock/configure`) to set its behavior per test scenario:

| Mode             | Behavior                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `normal`         | Returns accurate balances and accepts debits without error.                      |
| `stale`          | Returns a balance lower than what is stored locally.                             |
| `error`          | Returns `4xx` on debit requests (simulates HCM-side rejection).                  |
| `silent_failure` | Returns `200` on debit but does not actually update (unreliable acknowledgment). |
| `timeout`        | Delays response by 30s (simulates network timeout).                              |
| `anniversary`    | Increases balance by a configured amount between two consecutive requests.       |

---

## 9. Non-Functional Requirements

| Requirement   | Description                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness   | Balance deductions must be atomic and consistent. No request approved against a stale or invalid balance without defensive re-validation. |
| Idempotency   | All state-mutating endpoints must be safe to call multiple times with the same parameters.                                                |
| Observability | All HCM interactions and state transitions must be logged to `sync_audit_log` with enough context to reconstruct events.                  |
| Portability   | SQLite is used as specified. The data access layer is abstracted to allow migration to PostgreSQL with minimal changes.                   |
| Testability   | All external dependencies (HCM client) are injected and mockable. No hard-coded HTTP calls in business logic.                             |

---

## 10. Out of Scope

- Authentication and authorization (assumed to be handled by an upstream API gateway).
- Push notifications to employees or managers upon status changes.
- Multi-tenancy isolation beyond the per-employee per-location balance scoping.
- Calendar integration or working-day calculation (`days_requested` is treated as a raw number).
- Long-term archiving or GDPR data deletion workflows.

---

_End of Document - Time-Off Microservice TRD v1.0_
