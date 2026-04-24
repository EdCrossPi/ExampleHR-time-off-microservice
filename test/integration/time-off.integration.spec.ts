import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BalanceModule } from '../../src/balance/balance.module';
import { TimeOffModule } from '../../src/time-off/time-off.module';
import { SyncModule } from '../../src/sync/sync.module';
import { AuditModule } from '../../src/audit/audit.module';
import { HcmClientModule } from '../../src/hcm-client/hcm-client.module';
import { LeaveBalance } from '../../src/balance/balance.entity';
import { TimeOffRequest } from '../../src/time-off/time-off.entity';
import { SyncAuditLog } from '../../src/audit/audit.entity';
import axios from 'axios';

const HCM_URL = 'http://localhost:3001';

async function resetMock() {
  await axios.post(`${HCM_URL}/hcm-mock/reset`);
}

async function configureMock(config: object) {
  await axios.post(`${HCM_URL}/hcm-mock/configure`, config);
}

async function seedBalance(balance: object) {
  await axios.post(`${HCM_URL}/hcm-mock/seed`, balance);
}

describe('Time-Off Integration Tests', () => {
  let app: INestApplication;
  jest.setTimeout(30000);


  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [LeaveBalance, TimeOffRequest, SyncAuditLog],
          synchronize: true,
        }),
        HcmClientModule,
        AuditModule,
        BalanceModule,
        TimeOffModule,
        SyncModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetMock();
  });

  describe('Balance sync', () => {
    it('returns balance synced from HCM', async () => {
      await seedBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-1/loc-1/VACATION')
        .expect(200);

      expect(res.body.availableDays).toBe(10);
    });

    it('returns cached balance when HCM is unavailable', async () => {
      await seedBalance({ employeeId: 'emp-2', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 5 });

      await request(app.getHttpServer())
        .get('/api/v1/balances/emp-2/loc-1/VACATION')
        .expect(200);

      await configureMock({ mode: 'error' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-2/loc-1/VACATION')
        .expect(200);

      expect(res.body.availableDays).toBe(5);
    });
  });

  describe('Request creation', () => {
    it('creates a PENDING request when balance is sufficient', async () => {
      await seedBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-create-1')
        .send({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 3 })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.daysRequested).toBe(3);
    });

    it('returns existing request on duplicate idempotency key', async () => {
      await seedBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-idem-1')
        .send({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 2 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-idem-1')
        .send({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 2 })
        .expect(201);

      expect(res.body.idempotencyKey).toBe('key-idem-1');
    });

    it('rejects request when balance is insufficient', async () => {
      await seedBalance({ employeeId: 'emp-3', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 1 });

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-insuf-1')
        .send({ employeeId: 'emp-3', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 5 })
        .expect(422);
    });

    it('rejects request when days_requested is zero', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-zero-1')
        .send({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 0 })
        .expect(422);
    });
  });

  describe('Approval workflow', () => {
    it('approves request and deducts balance', async () => {
      await seedBalance({ employeeId: 'emp-4', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-approve-1')
        .send({ employeeId: 'emp-4', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 3 })
        .expect(201);

      const approved = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(200);

      expect(approved.body.status).toBe('APPROVED');
      expect(approved.body.hcmSyncStatus).toBe('SYNCED');

      const balance = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-4/loc-1/VACATION')
        .expect(200);

      expect(balance.body.availableDays).toBe(7);
    });

    it('rolls back when HCM debit fails', async () => {
      await seedBalance({ employeeId: 'emp-5', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-rollback-1')
        .send({ employeeId: 'emp-5', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 3 })
        .expect(201);

      await configureMock({ mode: 'error' });

      const approved = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(200);

      expect(approved.body.hcmSyncStatus).toBe('FAILED');

      await configureMock({ mode: 'normal' });

      const balance = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-5/loc-1/VACATION')
        .expect(200);

      expect(balance.body.availableDays).toBe(10);
    });

    it('rejects approval when HCM balance is stale and insufficient', async () => {
      await seedBalance({ employeeId: 'emp-6', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      await request(app.getHttpServer())
        .get('/api/v1/balances/emp-6/loc-1/VACATION')
        .expect(200);

      await configureMock({ mode: 'stale', staleAmount: 8 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-stale-1')
        .send({ employeeId: 'emp-6', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 5 })
        .expect(422);

      expect(created.body.message).toContain('Insufficient');
    });

    it('returns 409 when approving a non-PENDING request', async () => {
      await seedBalance({ employeeId: 'emp-7', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-conflict-1')
        .send({ employeeId: 'emp-7', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 2 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(409);
    });
  });

  describe('Cancellation', () => {
    it('cancels PENDING request without changing balance', async () => {
      await seedBalance({ employeeId: 'emp-8', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-cancel-1')
        .send({ employeeId: 'emp-8', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 3 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/cancel`)
        .expect(200);

      const balance = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-8/loc-1/VACATION')
        .expect(200);

      expect(balance.body.availableDays).toBe(10);
    });

    it('credits balance back when cancelling an APPROVED request', async () => {
      await seedBalance({ employeeId: 'emp-9', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-cancel-approved-1')
        .send({ employeeId: 'emp-9', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 4 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/cancel`)
        .expect(200);

      const balance = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-9/loc-1/VACATION')
        .expect(200);

      expect(balance.body.availableDays).toBe(10);
    });

    it('is idempotent when cancelling an already CANCELLED request', async () => {
      await seedBalance({ employeeId: 'emp-10', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-cancel-idem-1')
        .send({ employeeId: 'emp-10', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 2 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/cancel`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/cancel`)
        .expect(200);
    });
  });

  describe('Batch sync', () => {
    it('imports all balances atomically', async () => {
      const balances = [
        { employeeId: 'emp-batch-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 15 },
        { employeeId: 'emp-batch-2', locationId: 'loc-1', leaveType: 'SICK', availableDays: 8 },
      ];

      await request(app.getHttpServer())
        .post('/api/v1/sync/batch')
        .send({ balances })
        .expect(204);

      const res1 = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-batch-1/loc-1/VACATION')
        .expect(200);

      expect(res1.body.availableDays).toBe(15);

      const res2 = await request(app.getHttpServer())
        .get('/api/v1/balances/emp-batch-2/loc-1/SICK')
        .expect(200);

      expect(res2.body.availableDays).toBe(8);
    });
  });

  describe('Audit log', () => {
    it('records approval debit in audit log', async () => {
      await seedBalance({ employeeId: 'emp-audit-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 });

      const created = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('idempotency-key', 'key-audit-1')
        .send({ employeeId: 'emp-audit-1', locationId: 'loc-1', leaveType: 'VACATION', daysRequested: 2 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${created.body.id}/approve`)
        .expect(200);

      const audit = await request(app.getHttpServer())
        .get('/api/v1/audit?employeeId=emp-audit-1')
        .expect(200);

      const debitLog = audit.body.find((log: any) => log.eventType === 'APPROVAL_DEBIT');
      expect(debitLog).toBeDefined();
      expect(debitLog.result).toBe('SUCCESS');
    });
  });
});