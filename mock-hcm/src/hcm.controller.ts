import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HcmService, Balance } from './hcm.service';

@Controller()
export class HcmController {
  constructor(private readonly hcmService: HcmService) {}

  @Post('hcm-mock/configure')
  @HttpCode(204)
  configure(@Body() config: any): void {
    this.hcmService.configure(config);
  }

  @Post('hcm-mock/seed')
  @HttpCode(204)
  seed(@Body() balance: any): void {
    this.hcmService.seedBalance(balance);
  }

  @Post('hcm-mock/reset')
  @HttpCode(204)
  reset(): void {
    this.hcmService.reset();
  }

  @Get('balances/batch')
  getBatch(): Balance[] {
    return this.hcmService.getAllBalances();
  }

  @Get('balances/:employeeId/:locationId/:leaveType')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType') leaveType: string,
  ): Promise<Balance> {
    const config = this.hcmService.getConfig();

    if (config.mode === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    const balance = this.hcmService.getBalance(
      employeeId,
      locationId,
      leaveType,
    );
    if (!balance) {
      throw new HttpException('Balance not found', HttpStatus.NOT_FOUND);
    }
    return balance;
  }

  @Post('balances/debit')
  @HttpCode(200)
  debit(
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      leaveType: string;
      days: number;
    },
  ): { success: boolean } {
    const config = this.hcmService.getConfig();

    if (config.mode === 'error') {
      throw new HttpException(
        'Insufficient balance or invalid dimensions',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const success = this.hcmService.debit(
      body.employeeId,
      body.locationId,
      body.leaveType,
      body.days,
    );
    if (!success) {
      throw new HttpException('Debit failed', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return { success: true };
  }

  @Post('balances/credit')
  @HttpCode(200)
  credit(
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      leaveType: string;
      days: number;
    },
  ): { success: boolean } {
    const success = this.hcmService.credit(
      body.employeeId,
      body.locationId,
      body.leaveType,
      body.days,
    );
    if (!success) {
      throw new HttpException('Credit failed', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return { success: true };
  }
}
