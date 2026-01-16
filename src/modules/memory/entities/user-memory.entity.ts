import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';

export enum MemoryType {
  // Preferencias del usuario
  PREFERENCE = 'preference',

  // Información de contactos
  CONTACT = 'contact',

  // Patrones de comportamiento
  PATTERN = 'pattern',

  // Contexto de proyectos/trabajo
  PROJECT = 'project',

  // Información personal relevante
  PERSONAL = 'personal',

  // Instrucciones específicas del usuario
  INSTRUCTION = 'instruction',

  // Relaciones entre entidades
  RELATIONSHIP = 'relationship',

  // Historial de decisiones
  DECISION = 'decision',
}

export interface MemoryMetadata {
  // Para CONTACT
  email?: string;
  company?: string;
  role?: string;
  phone?: string;
  lastInteraction?: Date;

  // Para PROJECT
  projectName?: string;
  deadline?: Date;
  status?: string;
  team?: string[];

  // Para PREFERENCE
  category?: string; // "meetings", "communication", "schedule", "work_style"

  // Para RELATIONSHIP
  person1?: string;
  person2?: string;
  relationshipType?: string;

  // Para cualquier tipo
  source?: 'explicit' | 'inferred' | 'conversation';
  confidence?: number; // 0-1 para memorias inferidas
  tags?: string[];
  relatedMemories?: string[]; // IDs de memorias relacionadas
}

@Entity('user_memories')
@Index(['userId', 'type'])
@Index(['userId', 'createdAt'])
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: MemoryType,
  })
  type: MemoryType;

  @Column('text')
  content: string;

  @Column('jsonb', { nullable: true })
  metadata: MemoryMetadata;

  @Column('int', { default: 5 })
  importance: number; // 1-10

  @Column('timestamp', { nullable: true })
  lastAccessed: Date;

  @Column('int', { default: 0 })
  accessCount: number;

  @Column('timestamp', { nullable: true })
  expiresAt: Date; // Para memorias temporales

  @Column('boolean', { default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
