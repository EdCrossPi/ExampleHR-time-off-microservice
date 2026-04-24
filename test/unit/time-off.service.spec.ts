import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TimeOffService } from '../../src/time-off/time-off.service';
import { TimeOffRequest } from '../../src/time-off/time-off.entity';
import { BalanceService } from '../../src/balance/balance.service';
import { HcmClientService } from '../../src/hcm-client/hcm-client.service';
import { AuditService } from '../../src/audit/audit.service';
import { RequestStatus } from '../../src/common/enums/request-status.enum';
import { HcmSyncStatus } from '../../src/common/enums/hcm-sync-status.enum';

const mockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockBalanceService = () => ({
  findOne: jest.fn(),
  deductBalance: jest.fn(),
  creditBalance: jest.fn(),
});

const mockHcmClient = () => ({
  getBalance: jest.fn(),
  debitBalance: jest.fn(),
  creditBalance: jest.fn(),
});

const mockAuditService = () => ({
  log: jest.fn(),
});

describe('TimeOffService', () => {
  let service: TimeOffService;
  let requestRepository: any;
  let balanceService: any;
  let hcmClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffService,
        { provide: getRepositoryToken(TimeOffRequest), useFactory: mockRepository },
        { provide: BalanceService, useFactory: mockBalanceService },
        { provide: HcmClientService, useFactory: mockHcmClient },
        { provide: AuditService, useFactory: mockAuditService },
      ],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
    requestRepository = module.get(getRepositoryToken(TimeOffRequest));
    balanceService = module.get(BalanceService);
    hcmClient = module.get(HcmClientService);
  });

  describe('create', () => {
    const dto = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      leaveType: 'VACATION',
      daysRequested: 3,
      idempotencyKey: 'key-123',
    };

    it('returns existing request when idempotency key already exists', async () => {
      const existing = { id: 'uuid-1', ...dto, status: RequestStatus.PENDING };
      requestRepository.findOne.mockResolvedValue(existing);

      const result = await service.create(dto);

      expect(result).toEqual(existing);
      expect(balanceService.findOne).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when days_requested is zero', async () => {
      requestRepository.findOne.mockResolvedValue(null);

      await expect(service.create({ ...dto, daysRequested: 0 }))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when balance is insufficient', async () => {
      requestRepository.findOne.mockResolvedValue(null);
      balanceService.findOne.mockResolvedValue({ availableDays: 2 });

      await expect(service.create({ ...dto, daysRequested: 3 }))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('creates request when balance is sufficient', async () => {
      requestRepository.findOne.mockResolvedValue(null);
      balanceService.findOne.mockResolvedValue({ availableDays: 10 });
      requestRepository.create.mockReturnValue({ id: 'uuid-1', ...dto });
      requestRepository.save.mockResolvedValue({ id: 'uuid-1', ...dto, status: RequestStatus.PENDING });

      const result = await service.create(dto);

      expect(result.status).toBe(RequestStatus.PENDING);
      expect(requestRepository.save).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    const request = {
      id: 'uuid-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      leaveType: 'VACATION',
      daysRequested: 3,
      status: RequestStatus.PENDING,
      hcmSyncStatus: HcmSyncStatus.PENDING,
    };

    it('throws ConflictException when request is not PENDING', async () => {
      requestRepository.findOne.mockResolvedValue({ ...request, status: RequestStatus.REJECTED });

      await expect(service.approve('uuid-1')).rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException when HCM balance is insufficient', async () => {
      requestRepository.findOne.mockResolvedValue(request);
      hcmClient.getBalance.mockResolvedValue({ availableDays: 1 });

      await expect(service.approve('uuid-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('rolls back local deduction when HCM debit fails', async () => {
      requestRepository.findOne.mockResolvedValue(request);
      hcmClient.getBalance.mockResolvedValue({ availableDays: 10 });
      balanceService.deductBalance.mockResolvedValue({});
      hcmClient.debitBalance.mockResolvedValue(false);
      requestRepository.save.mockResolvedValue({ ...request, hcmSyncStatus: HcmSyncStatus.FAILED });

      const result = await service.approve('uuid-1');

      expect(balanceService.creditBalance).toHaveBeenCalledWith('emp-1', 'loc-1', 'VACATION', 3);
      expect(result.hcmSyncStatus).toBe(HcmSyncStatus.FAILED);
    });

    it('approves request and syncs to HCM when balance is sufficient', async () => {
      requestRepository.findOne.mockResolvedValue(request);
      hcmClient.getBalance.mockResolvedValue({ availableDays: 10 });
      balanceService.deductBalance.mockResolvedValue({});
      hcmClient.debitBalance.mockResolvedValue(true);
      requestRepository.save.mockResolvedValue({ ...request, status: RequestStatus.APPROVED, hcmSyncStatus: HcmSyncStatus.SYNCED });

      const result = await service.approve('uuid-1');

      expect(result.status).toBe(RequestStatus.APPROVED);
      expect(result.hcmSyncStatus).toBe(HcmSyncStatus.SYNCED);
    });

    it('proceeds with local balance when HCM is unavailable', async () => {
      const pendingRequest = {
        id: 'uuid-1',
        employeeId: 'emp-1',
        locationId: 'loc-1',
        leaveType: 'VACATION',
        daysRequested: 3,
        status: RequestStatus.PENDING,
        hcmSyncStatus: HcmSyncStatus.PENDING,
      };
      requestRepository.findOne.mockResolvedValue(pendingRequest);
      hcmClient.getBalance.mockResolvedValue(null);
      balanceService.deductBalance.mockResolvedValue({});
      hcmClient.debitBalance.mockResolvedValue(true);
      requestRepository.save.mockResolvedValue({
        ...pendingRequest,
        status: RequestStatus.APPROVED,
        hcmSyncStatus: HcmSyncStatus.SYNCED,
      });

      const result = await service.approve('uuid-1');

      expect(result.status).toBe(RequestStatus.APPROVED);
    });
  });

  describe('reject', () => {
    it('throws ConflictException when request is not PENDING', async () => {
      requestRepository.findOne.mockResolvedValue({ status: RequestStatus.APPROVED });

      await expect(service.reject('uuid-1')).rejects.toThrow(ConflictException);
    });

    it('rejects request without changing balance', async () => {
      const request = { id: 'uuid-1', status: RequestStatus.PENDING };
      requestRepository.findOne.mockResolvedValue(request);
      requestRepository.save.mockResolvedValue({ ...request, status: RequestStatus.REJECTED });

      const result = await service.reject('uuid-1');

      expect(result.status).toBe(RequestStatus.REJECTED);
      expect(balanceService.deductBalance).not.toHaveBeenCalled();
      expect(balanceService.creditBalance).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('returns request as-is when already CANCELLED', async () => {
      const request = { id: 'uuid-1', status: RequestStatus.CANCELLED };
      requestRepository.findOne.mockResolvedValue(request);

      const result = await service.cancel('uuid-1');

      expect(result.status).toBe(RequestStatus.CANCELLED);
      expect(requestRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when request is REJECTED', async () => {
      requestRepository.findOne.mockResolvedValue({ status: RequestStatus.REJECTED });

      await expect(service.cancel('uuid-1')).rejects.toThrow(ConflictException);
    });

    it('credits balance back when cancelling an APPROVED request', async () => {
      const request = {
        id: 'uuid-1',
        employeeId: 'emp-1',
        locationId: 'loc-1',
        leaveType: 'VACATION',
        daysRequested: 3,
        status: RequestStatus.APPROVED,
      };
      requestRepository.findOne.mockResolvedValue(request);
      balanceService.creditBalance.mockResolvedValue({});
      hcmClient.creditBalance.mockResolvedValue(true);
      requestRepository.save.mockResolvedValue({ ...request, status: RequestStatus.CANCELLED });

      const result = await service.cancel('uuid-1');

      expect(balanceService.creditBalance).toHaveBeenCalledWith('emp-1', 'loc-1', 'VACATION', 3);
      expect(result.status).toBe(RequestStatus.CANCELLED);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when request does not exist', async () => {
      requestRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('uuid-999')).rejects.toThrow(NotFoundException);
    });
  });
});