import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequest } from './time-off.entity';
import { HcmSyncStatus } from '../common/enums/hcm-sync-status.enum';
import { RequestStatus } from '../common/enums/request-status.enum';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { BalanceService } from '../balance/balance.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditResult } from '../audit/audit.entity';

@Injectable()
export class TimeOffScheduler {
  private readonly logger = new Logger(TimeOffScheduler.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly hcmClient: HcmClientService,
    private readonly balanceService: BalanceService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedHcmSync(): Promise<void> {
    const failedRequests = await this.requestRepository.find({
      where: {
        status: RequestStatus.APPROVED,
        hcmSyncStatus: HcmSyncStatus.FAILED,
      },
    });

    if (failedRequests.length === 0) return;

    this.logger.log(`Retrying HCM sync for ${failedRequests.length} failed request(s)`);

    for (const request of failedRequests) {
      request.hcmSyncStatus = HcmSyncStatus.RETRY;
      await this.requestRepository.save(request);

      const success = await this.hcmClient.debitBalance({
        employeeId: request.employeeId,
        locationId: request.locationId,
        leaveType: request.leaveType,
        days: request.daysRequested,
      });

      if (success) {
        request.hcmSyncStatus = HcmSyncStatus.SYNCED;
        await this.requestRepository.save(request);

        await this.auditService.log({
          eventType: AuditEventType.APPROVAL_DEBIT,
          result: AuditResult.SUCCESS,
          employeeId: request.employeeId,
          locationId: request.locationId,
          payload: { requestId: request.id, retried: true },
        });

        this.logger.log(`Retry succeeded for request ${request.id}`);
      } else {
        request.hcmSyncStatus = HcmSyncStatus.FAILED;
        await this.requestRepository.save(request);

        await this.auditService.log({
          eventType: AuditEventType.APPROVAL_DEBIT,
          result: AuditResult.FAILURE,
          employeeId: request.employeeId,
          locationId: request.locationId,
          errorMessage: 'HCM debit retry failed',
          payload: { requestId: request.id, retried: true },
        });

        this.logger.warn(`Retry failed for request ${request.id}, will try again next cycle`);
      }
    }
  }
}