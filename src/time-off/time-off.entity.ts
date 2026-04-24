import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { RequestStatus } from '../common/enums/request-status.enum';
import { HcmSyncStatus } from '../common/enums/hcm-sync-status.enum';

@Entity('time_off_request')
export class TimeOffRequest {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: string;

  @Column({ name: 'days_requested', type: 'real' })
  daysRequested!: number;

  @Column({ name: 'status', type: 'text', default: RequestStatus.PENDING })
  status!: RequestStatus;

  @Column({ name: 'hcm_sync_status', type: 'text', default: HcmSyncStatus.PENDING })
  hcmSyncStatus!: HcmSyncStatus;

  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}