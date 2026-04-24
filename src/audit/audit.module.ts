import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncAuditLog } from './audit.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([SyncAuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
