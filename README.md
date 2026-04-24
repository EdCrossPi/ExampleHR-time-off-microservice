# ExampleHR Time-Off Microservice

A NestJS microservice for managing employee time-off requests and synchronizing leave balances with an external Human Capital Management (HCM) system.

For a full description of the architecture, data model, and design decisions, see [TRD.md](./TRD.md).

## Requirements

- Node.js 18 or higher
- npm

## Getting Started

### 1. Install dependencies

From the project root:

```bash
npm install
```

### 2. Start the mock HCM server

The mock HCM server simulates the external HCM system. It must be running for the application and integration tests to work correctly.

Open a separate terminal and run:

```bash
cd mock-hcm
npm install
npm run start
```

The mock server runs on port 3001.

### 3. Start the main application

In another terminal, from the project root:

```bash
npm run start
```

The API will be available at `http://localhost:3000`.

## Running Tests

Make sure the mock HCM server is running before executing integration tests.

### Unit tests only

```bash
npx jest test/unit --no-coverage --runInBand
```

### Integration tests only

```bash
npx jest test/integration --no-coverage --runInBand
```

### All tests with coverage report

```bash
npx jest --coverage --runInBand
```

## API Overview

All endpoints are prefixed with `/api/v1`.

| Method | Endpoint                                     | Description                              |
|--------|----------------------------------------------|------------------------------------------|
| GET    | /health                                      | Health check                             |
| GET    | /balances/:employeeId                        | Get all balances for an employee         |
| GET    | /balances/:employeeId/:locationId/:leaveType | Get a specific balance                   |
| POST   | /sync/batch                                  | Ingest full balance corpus from HCM      |
| POST   | /requests                                    | Create a time-off request                |
| GET    | /requests/:id                                | Get a request by ID                      |
| GET    | /requests?employeeId=&status=                | List requests for an employee            |
| PATCH  | /requests/:id/approve                        | Approve a request                        |
| PATCH  | /requests/:id/reject                         | Reject a request                         |
| PATCH  | /requests/:id/cancel                         | Cancel a request                         |
| GET    | /audit?employeeId=&from=&to=                 | Query the audit log                      |

### Creating a request

Include the `Idempotency-Key` header on all POST requests to ensure safe retries.

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "leaveType": "VACATION",
    "daysRequested": 3
  }'
```

### Approving a request

```bash
curl -X PATCH http://localhost:3000/api/v1/requests/<id>/approve
```

### Querying the audit log

```bash
curl "http://localhost:3000/api/v1/audit?employeeId=emp-1&from=2026-01-01&to=2026-12-31"
```

## Architecture

The service is built with NestJS and TypeScript, using SQLite as the local database via TypeORM. It follows a layered architecture with five modules:

| Module           | Responsibility                                                                 |
|------------------|--------------------------------------------------------------------------------|
| BalanceModule    | Manages local leave balance cache and HCM synchronization                      |
| TimeOffModule    | Handles request lifecycle with a strict state machine                          |
| HcmClientModule  | Centralizes all outbound communication with the HCM                            |
| SyncModule       | Processes full batch imports from the HCM transactionally                      |
| AuditModule      | Maintains an append-only log of all HCM sync events                            |

### Request lifecycle

```
PENDING -> APPROVED -> CANCELLED
PENDING -> REJECTED
PENDING -> CANCELLED
```

A request is created as PENDING. A manager approves or rejects it. An approved request can be cancelled, which credits the balance back and notifies the HCM.

## Key Design Decisions

- **Optimistic locking** on balance deductions to prevent race conditions under concurrent approvals
- **Idempotency keys** on all POST requests to ensure safe retries under network failures
- **Defensive local validation** before any HCM call, since HCM error responses are not guaranteed
- **Pre-approval HCM re-validation** to catch balance changes that occurred between request creation and approval
- **Transactional batch sync** to prevent partial state on import failures
- **Scheduled retry** every minute for approved requests with failed HCM sync
- **Parallel HCM sync** when fetching multiple balances for the same employee

## Mock HCM Server

The mock server runs as a separate NestJS application on port 3001. It supports configurable behaviors for testing failure scenarios.

### Seeding a balance

```bash
curl -X POST http://localhost:3001/hcm-mock/seed \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "leaveType": "VACATION",
    "availableDays": 10
  }'
```

### Configuring mock behavior

```bash
curl -X POST http://localhost:3001/hcm-mock/configure \
  -H "Content-Type: application/json" \
  -d '{ "mode": "error" }'
```

| Mode           | Behavior                                                              |
|----------------|-----------------------------------------------------------------------|
| normal         | Returns accurate balances and accepts debits without error            |
| stale          | Returns a balance lower than what is stored locally                   |
| error          | Returns 4xx on debit requests                                         |
| silent_failure | Returns 200 on debit but does not actually update                     |
| timeout        | Delays response by 30s                                                |
| anniversary    | Increases balance by a configured amount between two requests         |

### Resetting to initial state

```bash
curl -X POST http://localhost:3001/hcm-mock/reset
```
