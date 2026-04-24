import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditEventType {
  REALTIME_SYNC = 'REALTIME_SYNC',
  BATCH_SYNC = 'BATCH_SYNC',
  APPROVAL_DEBIT = 'APPROVAL_DEBIT',
  CANCEL_CREDIT = 'CANCEL_CREDIT',
}

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

@Entity('sync_audit_log')
export class SyncAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: AuditEventType;

  @Column({ name: 'employee_id', type: 'text', nullable: true })
  employeeId!: string | null;

  @Column({ name: 'location_id', type: 'text', nullable: true })
  locationId!: string | null;

  @Column({ name: 'payload', type: 'text', nullable: true })
  payload!: string | null;

  @Column({ name: 'result', type: 'text' })
  result!: AuditResult;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}