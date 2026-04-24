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
  id: number;

  @Column({ name: 'event_type' })
  eventType: AuditEventType;

  @Column({ name: 'employee_id', nullable: true })
  employeeId: string;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @Column({ name: 'payload', type: 'text', nullable: true })
  payload: string;

  @Column({ name: 'result' })
  result: AuditResult;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}