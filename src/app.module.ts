import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
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
    ScheduleModule.forRoot(),
    BalanceModule,
    TimeOffModule,
    HcmClientModule,
    SyncModule,
    AuditModule,
  ],
  controllers: [AppController],
})
export class AppModule {}