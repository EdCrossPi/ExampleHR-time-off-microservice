import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum HcmSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  RETRY = 'RETRY',
}

@Entity('time_off_request')
export class TimeOffRequest {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ name: 'leave_type' })
  leaveType: string;

  @Column({ name: 'days_requested', type: 'real' })
  daysRequested: number;

  @Column({ name: 'status', default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column({ name: 'hcm_sync_status', default: HcmSyncStatus.PENDING })
  hcmSyncStatus: HcmSyncStatus;

  @Column({ name: 'idempotency_key', unique: true })
  idempotencyKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}