import { Controller, Get, Post, Patch, Param, Body, Query, Headers, HttpCode } from '@nestjs/common';
import { TimeOffService, CreateTimeOffRequestDto } from './time-off.service';
import { RequestStatus } from '../common/enums/request-status.enum';

@Controller('api/v1/requests')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post()
  create(
    @Body() body: Omit<CreateTimeOffRequestDto, 'idempotencyKey'>,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.timeOffService.create({ ...body, idempotencyKey });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeOffService.findOne(id);
  }

  @Get()
  findAll(
    @Query('employeeId') employeeId: string,
    @Query('status') status?: RequestStatus,
  ) {
    return this.timeOffService.findAll(employeeId, status);
  }

  @Patch(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string) {
    return this.timeOffService.approve(id);
  }

  @Patch(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string) {
    return this.timeOffService.reject(id);
  }

  @Patch(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.timeOffService.cancel(id);
  }
}