import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Priority } from '@/common/constants/priorities';
import { TaskStatus } from '@/common/constants/status';

@Entity('tasks')
export class Task extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: Priority,
    default: Priority.MEDIUM,
  })
  priority: Priority;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({ name: 'due_date', nullable: true })
  dueDate?: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.tasks)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  source?: string; // 'manual', 'email', 'calendar', 'agent'

  @Column({ name: 'external_id', nullable: true })
  externalId?: string; // ID from external system (email ID, calendar event ID, etc.)
}
