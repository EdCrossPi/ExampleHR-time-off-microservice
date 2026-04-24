import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { HcmClientService } from '../../src/hcm-client/hcm-client.service';

const mockHttpService = () => ({
  get: jest.fn(),
  post: jest.fn(),
});

describe('HcmClientService', () => {
  let service: HcmClientService;
  let httpService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HcmClientService,
        { provide: HttpService, useFactory: mockHttpService },
      ],
    }).compile();

    service = module.get<HcmClientService>(HcmClientService);
    httpService = module.get(HttpService);
  });

  describe('getBalance', () => {
    it('returns balance from HCM', async () => {
      const balance = { employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 };
      httpService.get.mockReturnValue(of({ data: balance }));

      const result = await service.getBalance('emp-1', 'loc-1', 'VACATION');

      expect(result).toEqual(balance);
    });

    it('returns null when HCM call fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

      const result = await service.getBalance('emp-1', 'loc-1', 'VACATION');

      expect(result).toBeNull();
    });
  });

  describe('debitBalance', () => {
    it('returns true when debit succeeds', async () => {
      httpService.post.mockReturnValue(of({ data: { success: true } }));

      const result = await service.debitBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', days: 3 });

      expect(result).toBe(true);
    });

    it('returns false when debit fails', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('HCM error')));

      const result = await service.debitBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', days: 3 });

      expect(result).toBe(false);
    });
  });

  describe('creditBalance', () => {
    it('returns true when credit succeeds', async () => {
      httpService.post.mockReturnValue(of({ data: { success: true } }));

      const result = await service.creditBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', days: 3 });

      expect(result).toBe(true);
    });

    it('returns false when credit fails', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('HCM error')));

      const result = await service.creditBalance({ employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', days: 3 });

      expect(result).toBe(false);
    });
  });

  describe('batchGetBalances', () => {
    it('returns list of balances from HCM', async () => {
      const balances = [
        { employeeId: 'emp-1', locationId: 'loc-1', leaveType: 'VACATION', availableDays: 10 },
        { employeeId: 'emp-2', locationId: 'loc-1', leaveType: 'SICK', availableDays: 5 },
      ];
      httpService.get.mockReturnValue(of({ data: balances }));

      const result = await service.batchGetBalances();

      expect(result).toEqual(balances);
    });

    it('returns empty array when HCM call fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

      const result = await service.batchGetBalances();

      expect(result).toEqual([]);
    });
  });
});