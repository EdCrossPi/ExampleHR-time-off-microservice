import { Controller, Get, Param } from '@nestjs/common';
import { BalanceService } from './balance.service';

@Controller('api/v1/balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId')
  findAll(@Param('employeeId') employeeId: string) {
    return this.balanceService.findAllByEmployee(employeeId);
  }

  @Get(':employeeId/:locationId/:leaveType')
  findOne(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType') leaveType: string,
  ) {
    return this.balanceService.findOne(employeeId, locationId, leaveType);
  }
}