import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './time-off.entity';
import { TimeOffService } from './time-off.service';
import { TimeOffController } from './time-off.controller';
import { TimeOffScheduler } from './time-off.scheduler';
import { BalanceModule } from '../balance/balance.module';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest]),
    BalanceModule,
    HcmClientModule,
    AuditModule,
  ],
  providers: [TimeOffService, TimeOffScheduler],
  controllers: [TimeOffController],
})
export class TimeOffModule {}