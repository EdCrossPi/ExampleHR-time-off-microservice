import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TimeOffRequest } from './time-off.entity';
import { RequestStatus } from '../common/enums/request-status.enum';
import { HcmSyncStatus } from '../common/enums/hcm-sync-status.enum';
import { BalanceService } from '../balance/balance.service';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditResult } from '../audit/audit.entity';

export interface CreateTimeOffRequestDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  daysRequested: number;
  idempotencyKey: string;
}

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmClient: HcmClientService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    const existing = await this.requestRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    if (dto.daysRequested <= 0) {
      throw new UnprocessableEntityException('days_requested must be greater than zero');
    }

    const balance = await this.balanceService.findOne(
      dto.employeeId,
      dto.locationId,
      dto.leaveType,
    );

    if (balance.availableDays < dto.daysRequested) {
      throw new UnprocessableEntityException(
        `Insufficient balance. Available: ${balance.availableDays}, Requested: ${dto.daysRequested}`,
      );
    }

    const request = this.requestRepository.create({
      id: uuidv4(),
      employeeId: dto.employeeId,
      locationId: dto.locationId,
      leaveType: dto.leaveType,
      daysRequested: dto.daysRequested,
      idempotencyKey: dto.idempotencyKey,
      status: RequestStatus.PENDING,
      hcmSyncStatus: HcmSyncStatus.PENDING,
    });

    return this.requestRepository.save(request);
  }

  async findOne(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return request;
  }

  async findAll(employeeId: string, status?: RequestStatus): Promise<TimeOffRequest[]> {
    const where: any = { employeeId };
    if (status) {
      where.status = status;
    }
    return this.requestRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async approve(id: string): Promise<TimeOffRequest> {
    const request = await this.findOne(id);

    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException(`Cannot approve a request with status ${request.status}`);
    }

    const hcmBalance = await this.hcmClient.getBalance(
      request.employeeId,
      request.locationId,
      request.leaveType,
    );

    const availableDays = hcmBalance ? hcmBalance.availableDays : null;

    if (availableDays !== null && availableDays < request.daysRequested) {
      throw new UnprocessableEntityException(
        `Insufficient balance in HCM. Available: ${availableDays}, Requested: ${request.daysRequested}`,
      );
    }

    await this.balanceService.deductBalance(
      request.employeeId,
      request.locationId,
      request.leaveType,
      request.daysRequested,
    );

    const hcmSuccess = await this.hcmClient.debitBalance({
      employeeId: request.employeeId,
      locationId: request.locationId,
      leaveType: request.leaveType,
      days: request.daysRequested,
    });

    if (!hcmSuccess) {
      await this.balanceService.creditBalance(
        request.employeeId,
        request.locationId,
        request.leaveType,
        request.daysRequested,
      );

      await this.auditService.log({
        eventType: AuditEventType.APPROVAL_DEBIT,
        result: AuditResult.FAILURE,
        employeeId: request.employeeId,
        locationId: request.locationId,
        errorMessage: 'HCM debit failed, local deduction rolled back',
        payload: { requestId: id },
      });

      request.hcmSyncStatus = HcmSyncStatus.FAILED;
      return this.requestRepository.save(request);
    }

    await this.auditService.log({
      eventType: AuditEventType.APPROVAL_DEBIT,
      result: AuditResult.SUCCESS,
      employeeId: request.employeeId,
      locationId: request.locationId,
      payload: { requestId: id, daysDeducted: request.daysRequested },
    });

    request.status = RequestStatus.APPROVED;
    request.hcmSyncStatus = HcmSyncStatus.SYNCED;
    return this.requestRepository.save(request);
  }

  async reject(id: string): Promise<TimeOffRequest> {
    const request = await this.findOne(id);

    if (request.status !== RequestStatus.PENDING) {
      throw new ConflictException(`Cannot reject a request with status ${request.status}`);
    }

    request.status = RequestStatus.REJECTED;
    return this.requestRepository.save(request);
  }

  async cancel(id: string): Promise<TimeOffRequest> {
    const request = await this.findOne(id);

    if (request.status === RequestStatus.CANCELLED) {
      return request;
    }

    if (request.status === RequestStatus.REJECTED) {
      throw new ConflictException(`Cannot cancel a request with status ${request.status}`);
    }

    if (request.status === RequestStatus.APPROVED) {
      await this.balanceService.creditBalance(
        request.employeeId,
        request.locationId,
        request.leaveType,
        request.daysRequested,
      );

      await this.hcmClient.creditBalance({
        employeeId: request.employeeId,
        locationId: request.locationId,
        leaveType: request.leaveType,
        days: request.daysRequested,
      });

      await this.auditService.log({
        eventType: AuditEventType.CANCEL_CREDIT,
        result: AuditResult.SUCCESS,
        employeeId: request.employeeId,
        locationId: request.locationId,
        payload: { requestId: id, daysCredited: request.daysRequested },
      });
    }

    request.status = RequestStatus.CANCELLED;
    return this.requestRepository.save(request);
  }
}