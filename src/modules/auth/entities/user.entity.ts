import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Task } from '@/modules/tasks/entities/task.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true, name: 'avatar_url' })
  avatarUrl?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ nullable: true, name: 'cognito_id' })
  cognitoId?: string;

  @Column({ nullable: true, name: 'microsoft_refresh_token' })
  microsoftRefreshToken?: string;

  @Column({ nullable: true, name: 'google_refresh_token' })
  googleRefreshToken?: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences?: Record<string, unknown>;

  @OneToMany(() => Task, (task) => task.user)
  tasks: Task[];

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
