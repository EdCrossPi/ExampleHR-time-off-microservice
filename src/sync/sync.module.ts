import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance } from '../balance/balance.entity';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveBalance]),
    HcmClientModule,
    AuditModule,
  ],
  providers: [SyncService],
  controllers: [SyncController],
})
export class SyncModule {}