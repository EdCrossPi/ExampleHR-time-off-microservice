import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from './balance/balance.module';
import { TimeOffModule } from './time-off/time-off.module';
import { HcmClientModule } from './hcm-client/hcm-client.module';
import { SyncModule } from './sync/sync.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'timeoff.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    BalanceModule,
    TimeOffModule,
    HcmClientModule,
    SyncModule,
    AuditModule,
  ],
})
export class AppModule {}
