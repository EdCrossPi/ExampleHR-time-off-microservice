import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.auditService.findAll(employeeId, fromDate, toDate);
  }
}