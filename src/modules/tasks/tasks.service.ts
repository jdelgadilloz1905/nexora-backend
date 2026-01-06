import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskQueryDto,
  PaginatedTasksResponseDto,
} from './dto/task.dto';
import { TaskStatus } from '@/common/constants/status';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    const task = this.taskRepository.create({
      ...dto,
      userId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });
    return this.taskRepository.save(task);
  }

  async findAll(
    userId: string,
    query: TaskQueryDto,
  ): Promise<PaginatedTasksResponseDto> {
    const { priority, status, page = 1, limit = 20 } = query;

    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere('task.deletedAt IS NULL');

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    queryBuilder
      .orderBy('task.priority', 'ASC') // HIGH first
      .addOrderBy('task.dueDate', 'ASC')
      .addOrderBy('task.createdAt', 'DESC');

    const total = await queryBuilder.getCount();
    const items = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id, userId, deletedAt: undefined },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(userId, id);

    Object.assign(task, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : task.dueDate,
    });

    // If marking as completed, set completedAt
    if (dto.status === TaskStatus.COMPLETED && !task.completedAt) {
      task.completedAt = new Date();
    }

    return this.taskRepository.save(task);
  }

  async complete(userId: string, id: string): Promise<Task> {
    return this.update(userId, id, { status: TaskStatus.COMPLETED });
  }

  async remove(userId: string, id: string): Promise<void> {
    const task = await this.findOne(userId, id);
    await this.taskRepository.softRemove(task);
  }

  async getTodaysBriefing(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere('task.status != :completed', {
        completed: TaskStatus.COMPLETED,
      })
      .andWhere('task.deletedAt IS NULL')
      .orderBy('task.priority', 'ASC')
      .getMany();

    const highPriority = tasks.filter((t) => t.priority === 'HIGH');
    const mediumPriority = tasks.filter((t) => t.priority === 'MEDIUM');
    const lowPriority = tasks.filter((t) => t.priority === 'LOW');
    const noise = tasks.filter((t) => t.priority === 'NOISE');

    return {
      date: today.toISOString(),
      summary: {
        high: highPriority.length,
        medium: mediumPriority.length,
        low: lowPriority.length,
        noise: noise.length,
        total: tasks.length,
      },
      tasks: {
        high: highPriority,
        medium: mediumPriority,
        low: lowPriority,
        noise,
      },
    };
  }
}
