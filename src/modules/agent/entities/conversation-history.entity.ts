import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';

/**
 * FASE 3: ConversationHistory Entity
 * Stores archived conversation periods with AI-generated summaries
 * Similar to medical records in hospitals - archived but always accessible
 */
@Entity('conversation_history')
export class ConversationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_history_user')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Archived period
  @Column('timestamp')
  @Index('idx_history_period_start')
  periodStart: Date;

  @Column('timestamp')
  @Index('idx_history_period_end')
  periodEnd: Date;

  // Content
  @Column('jsonb')
  messagesJson: Array<{
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;

  @Column('int')
  messageCount: number;

  // AI-generated summary
  @Column('text', { nullable: true })
  summary: string;

  // Topics extracted by AI
  @Column('text', { array: true, nullable: true })
  @Index('idx_history_topics', { synchronize: false }) // GIN index created manually
  topics: string[];

  // Entities extracted by AI
  @Column('jsonb', { nullable: true })
  entities: {
    contacts: string[];
    projects: string[];
    amounts: string[];
    dates: string[];
    decisions: string[];
  };

  // Full-text search vector (populated by trigger)
  @Column('tsvector', { nullable: true, select: false })
  @Index('idx_history_search', { synchronize: false }) // GIN index created manually
  searchVector: string;

  @CreateDateColumn()
  archivedAt: Date;
}
