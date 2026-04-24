import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('leave_balance')
@Index(['employeeId', 'locationId', 'leaveType'], { unique: true })
export class LeaveBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ name: 'leave_type' })
  leaveType: string;

  @Column({ name: 'available_days', type: 'real' })
  availableDays: number;

  @Column({ name: 'version', default: 1 })
  version: number;

  @Column({ name: 'last_synced_at', type: 'datetime', nullable: true })
  lastSyncedAt: Date;
}