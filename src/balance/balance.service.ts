import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from './balance.entity';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditResult } from '../audit/audit.entity';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectRepository(LeaveBalance)
    private readonly balanceRepository: Repository<LeaveBalance>,
    private readonly hcmClient: HcmClientService,
    private readonly auditService: AuditService,
  ) {}

  async findAllByEmployee(employeeId: string): Promise<LeaveBalance[]> {
    await this.syncFromHcmByEmployee(employeeId);
    return this.balanceRepository.find({ where: { employeeId } });
  }

  async findOne(employeeId: string, locationId: string, leaveType: string): Promise<LeaveBalance> {
    await this.syncFromHcm(employeeId, locationId, leaveType);
    const balance = await this.balanceRepository.findOne({
      where: { employeeId, locationId, leaveType },
    });
    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }
    return balance;
  }

  async deductBalance(employeeId: string, locationId: string, leaveType: string, days: number): Promise<LeaveBalance> {
    const balance = await this.balanceRepository.findOne({
      where: { employeeId, locationId, leaveType },
    });

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    const currentVersion = balance.version;
    const updated = await this.balanceRepository
      .createQueryBuilder()
      .update(LeaveBalance)
      .set({
        availableDays: () => `available_days - ${days}`,
        version: () => 'version + 1',
        lastSyncedAt: new Date(),
      })
      .where('employee_id = :employeeId', { employeeId })
      .andWhere('location_id = :locationId', { locationId })
      .andWhere('leave_type = :leaveType', { leaveType })
      .andWhere('version = :currentVersion', { currentVersion })
      .execute();

    if (updated.affected === 0) {
      this.logger.warn(`Optimistic lock conflict for employee ${employeeId}, retrying`);
      return this.deductBalance(employeeId, locationId, leaveType, days);
    }

    const result = await this.balanceRepository.findOne({ where: { employeeId, locationId, leaveType } });
    if (!result) {
        throw new NotFoundException(`Balance not found after deduction for employee ${employeeId}`);
    }
    return result;
  }

  async creditBalance(employeeId: string, locationId: string, leaveType: string, days: number): Promise<LeaveBalance> {
    const balance = await this.balanceRepository.findOne({
      where: { employeeId, locationId, leaveType },
    });

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    const currentVersion = balance.version;
    const updated = await this.balanceRepository
      .createQueryBuilder()
      .update(LeaveBalance)
      .set({
        availableDays: () => `available_days + ${days}`,
        version: () => 'version + 1',
        lastSyncedAt: new Date(),
      })
      .where('employee_id = :employeeId', { employeeId })
      .andWhere('location_id = :locationId', { locationId })
      .andWhere('leave_type = :leaveType', { leaveType })
      .andWhere('version = :currentVersion', { currentVersion })
      .execute();

    if (updated.affected === 0) {
      this.logger.warn(`Optimistic lock conflict for employee ${employeeId}, retrying`);
      return this.creditBalance(employeeId, locationId, leaveType, days);
    }

    const result = await this.balanceRepository.findOne({ where: { employeeId, locationId, leaveType } });
    if (!result) {
      throw new NotFoundException(`Balance not found after deduction for employee ${employeeId}`);
    }
    return result;
  }

  async upsertFromHcm(employeeId: string, locationId: string, leaveType: string, availableDays: number): Promise<void> {
    await this.balanceRepository
      .createQueryBuilder()
      .insert()
      .into(LeaveBalance)
      .values({ employeeId, locationId, leaveType, availableDays, version: 1, lastSyncedAt: new Date() })
      .orUpdate(['available_days', 'last_synced_at', 'version'], ['employee_id', 'location_id', 'leave_type'])
      .execute();
  }

  private async syncFromHcm(employeeId: string, locationId: string, leaveType: string): Promise<void> {
    const hcmBalance = await this.hcmClient.getBalance(employeeId, locationId, leaveType);

    if (!hcmBalance) {
      await this.auditService.log({
        eventType: AuditEventType.REALTIME_SYNC,
        result: AuditResult.FAILURE,
        employeeId,
        locationId,
        errorMessage: 'HCM did not return a balance',
      });
      return;
    }

    await this.upsertFromHcm(employeeId, locationId, leaveType, hcmBalance.availableDays);
    await this.auditService.log({
      eventType: AuditEventType.REALTIME_SYNC,
      result: AuditResult.SUCCESS,
      employeeId,
      locationId,
      payload: { availableDays: hcmBalance.availableDays },
    });
  }

  private async syncFromHcmByEmployee(employeeId: string): Promise<void> {
    const localBalances = await this.balanceRepository.find({ where: { employeeId } });
    await Promise.all(
      localBalances.map(balance =>
        this.syncFromHcm(employeeId, balance.locationId, balance.leaveType),
      ),
    );
  }
}
