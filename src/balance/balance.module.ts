import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance } from './balance.entity';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveBalance]),
    HcmClientModule,
    AuditModule,
  ],
  providers: [BalanceService],
  controllers: [BalanceController],
  exports: [BalanceService],
})
export class BalanceModule {}