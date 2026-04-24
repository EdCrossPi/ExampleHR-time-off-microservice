import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BalanceModule } from './balance/balance.module';
import { TimeOffModule } from './time-off/time-off.module';
import { HcmClientModule } from './hcm-client/hcm-client.module';
import { SyncModule } from './sync/sync.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [BalanceModule, TimeOffModule, HcmClientModule, SyncModule, AuditModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
