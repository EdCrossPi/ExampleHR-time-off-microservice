import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('leave_balance')
@Index(['employeeId', 'locationId', 'leaveType'], { unique: true })
export class LeaveBalance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: string;

  @Column({ name: 'available_days', type: 'real' })
  availableDays!: number;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'last_synced_at', type: 'datetime', nullable: true })
  lastSyncedAt!: Date | null;
}