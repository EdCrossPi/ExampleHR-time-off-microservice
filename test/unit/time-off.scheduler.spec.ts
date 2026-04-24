import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeOffScheduler } from '../../src/time-off/time-off.scheduler';
import { TimeOffRequest } from '../../src/time-off/time-off.entity';
import { HcmClientService } from '../../src/hcm-client/hcm-client.service';
import { BalanceService } from '../../src/balance/balance.service';
import { AuditService } from '../../src/audit/audit.service';
import { RequestStatus } from '../../src/common/enums/request-status.enum';
import { HcmSyncStatus } from '../../src/common/enums/hcm-sync-status.enum';

const mockRepository = () => ({
  find: jest.fn(),
  save: jest.fn(),
});

const mockHcmClient = () => ({
  debitBalance: jest.fn(),
});

const mockBalanceService = () => ({});

const mockAuditService = () => ({
  log: jest.fn(),
});

describe('TimeOffScheduler', () => {
  let scheduler: TimeOffScheduler;
  let requestRepository: any;
  let hcmClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffScheduler,
        { provide: getRepositoryToken(TimeOffRequest), useFactory: mockRepository },
        { provide: HcmClientService, useFactory: mockHcmClient },
        { provide: BalanceService, useFactory: mockBalanceService },
        { provide: AuditService, useFactory: mockAuditService },
      ],
    }).compile();

    scheduler = module.get<TimeOffScheduler>(TimeOffScheduler);
    requestRepository = module.get(getRepositoryToken(TimeOffRequest));
    hcmClient = module.get(HcmClientService);
  });

  it('does nothing when there are no failed requests', async () => {
    requestRepository.find.mockResolvedValue([]);

    await scheduler.retryFailedHcmSync();

    expect(hcmClient.debitBalance).not.toHaveBeenCalled();
  });

  it('retries and marks as SYNCED when HCM debit succeeds', async () => {
    const failedRequest = {
      id: 'uuid-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      leaveType: 'VACATION',
      daysRequested: 3,
      status: RequestStatus.APPROVED,
      hcmSyncStatus: HcmSyncStatus.FAILED,
    };
    requestRepository.find.mockResolvedValue([failedRequest]);
    requestRepository.save.mockResolvedValue({});
    hcmClient.debitBalance.mockResolvedValue(true);

    await scheduler.retryFailedHcmSync();

    expect(hcmClient.debitBalance).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      leaveType: 'VACATION',
      days: 3,
    });

    const lastSave = requestRepository.save.mock.calls.at(-1)[0];
    expect(lastSave.hcmSyncStatus).toBe(HcmSyncStatus.SYNCED);
  });

  it('keeps as FAILED when HCM debit still fails on retry', async () => {
    const failedRequest = {
      id: 'uuid-2',
      employeeId: 'emp-2',
      locationId: 'loc-1',
      leaveType: 'VACATION',
      daysRequested: 2,
      status: RequestStatus.APPROVED,
      hcmSyncStatus: HcmSyncStatus.FAILED,
    };
    requestRepository.find.mockResolvedValue([failedRequest]);
    requestRepository.save.mockResolvedValue({});
    hcmClient.debitBalance.mockResolvedValue(false);

    await scheduler.retryFailedHcmSync();

    const lastSave = requestRepository.save.mock.calls.at(-1)[0];
    expect(lastSave.hcmSyncStatus).toBe(HcmSyncStatus.FAILED);
  });
});