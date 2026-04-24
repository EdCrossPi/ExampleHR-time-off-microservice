import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncAuditLog, AuditEventType, AuditResult } from './audit.entity';

interface CreateAuditLogParams {
  eventType: AuditEventType;
  result: AuditResult;
  employeeId?: string;
  locationId?: string;
  payload?: object;
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(SyncAuditLog)
    private readonly auditRepository: Repository<SyncAuditLog>,
  ) {}

  async log(params: CreateAuditLogParams): Promise<void> {
    const entry = this.auditRepository.create({
      eventType: params.eventType,
      result: params.result,
      employeeId: params.employeeId,
      locationId: params.locationId,
      payload: params.payload ? JSON.stringify(params.payload) : undefined,
      errorMessage: params.errorMessage,
    });
    await this.auditRepository.save(entry);
  }

  async findAll(employeeId?: string, from?: Date, to?: Date): Promise<SyncAuditLog[]> {
    const query = this.auditRepository.createQueryBuilder('log');

    if (employeeId) {
      query.andWhere('log.employeeId = :employeeId', { employeeId });
    }
    if (from) {
      query.andWhere('log.createdAt >= :from', { from });
    }
    if (to) {
      query.andWhere('log.createdAt <= :to', { to });
    }

    return query.orderBy('log.createdAt', 'DESC').getMany();
  }
}
