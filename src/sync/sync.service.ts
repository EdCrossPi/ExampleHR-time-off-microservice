import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LeaveBalance } from '../balance/balance.entity';
import { HcmClientService, HcmBalance } from '../hcm-client/hcm-client.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditResult } from '../audit/audit.entity';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(LeaveBalance)
    private readonly balanceRepository: Repository<LeaveBalance>,
    private readonly hcmClient: HcmClientService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async runBatchSync(balances: HcmBalance[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const balance of balances) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(LeaveBalance)
          .values({
            employeeId: balance.employeeId,
            locationId: balance.locationId,
            leaveType: balance.leaveType,
            availableDays: balance.availableDays,
            version: 1,
            lastSyncedAt: new Date(),
          })
          .orUpdate(
            ['available_days', 'last_synced_at', 'version'],
            ['employee_id', 'location_id', 'leave_type'],
          )
          .execute();
      }

      await queryRunner.commitTransaction();

      await this.auditService.log({
        eventType: AuditEventType.BATCH_SYNC,
        result: AuditResult.SUCCESS,
        payload: { totalRecords: balances.length },
      });

      this.logger.log(`Batch sync completed: ${balances.length} records processed`);
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const message = error instanceof Error ? error.message : String(error);

      await this.auditService.log({
        eventType: AuditEventType.BATCH_SYNC,
        result: AuditResult.FAILURE,
        errorMessage: message,
        payload: { totalRecords: balances.length },
      });

      this.logger.error(`Batch sync failed and was rolled back: ${message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async runBatchSyncFromHcm(): Promise<void> {
    const balances = await this.hcmClient.batchGetBalances();
    if (balances.length === 0) {
      this.logger.warn('HCM returned no balances for batch sync');
      return;
    }
    await this.runBatchSync(balances);
  }
}