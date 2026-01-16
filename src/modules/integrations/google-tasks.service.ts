import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from './google.service';

export interface TaskList {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  notes?: string;
  due?: Date;
  status: 'needsAction' | 'completed';
  completed?: Date;
  parent?: string;
  position?: string;
  links?: { type: string; description: string; link: string }[];
}

export interface CreateTaskDto {
  listId?: string;
  title: string;
  notes?: string;
  due?: Date;
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  due?: Date;
  status?: 'needsAction' | 'completed';
}

@Injectable()
export class GoogleTasksService {
  private readonly logger = new Logger(GoogleTasksService.name);

  constructor(private readonly googleService: GoogleService) {}

  async getTaskLists(userId: string): Promise<TaskList[]> {
    const tasks = await this.googleService.getTasksClient(userId);

    const response = await tasks.tasklists.list({
      maxResults: 100,
    });

    const lists = response.data.items || [];

    return lists.map((list) => ({
      id: list.id!,
      title: list.title || 'Sin título',
    }));
  }

  async getTasks(
    userId: string,
    listId: string = '@default',
    showCompleted: boolean = false,
  ): Promise<Task[]> {
    const tasks = await this.googleService.getTasksClient(userId);

    const response = await tasks.tasks.list({
      tasklist: listId,
      showCompleted,
      showHidden: showCompleted,
      maxResults: 100,
    });

    const items = response.data.items || [];

    return items.map((task) => {
      // Google Tasks sometimes has empty title with content in notes
      // If title is empty but notes exists, use notes as title
      let title = task.title?.trim() || '';
      let notes = task.notes?.trim() || '';

      if (!title && notes) {
        // Use first line of notes as title if title is empty
        const firstLine = notes.split('\n')[0];
        title = firstLine;
        // Keep remaining lines as notes
        const remainingLines = notes.split('\n').slice(1).join('\n').trim();
        notes = remainingLines || '';
      }

      return {
        id: task.id!,
        listId,
        title: title || 'Sin título',
        notes: notes || undefined,
        due: task.due ? new Date(task.due) : undefined,
        status: task.status as 'needsAction' | 'completed',
        completed: task.completed ? new Date(task.completed) : undefined,
        parent: task.parent || undefined,
        position: task.position || undefined,
        links: task.links?.map((l) => ({
          type: l.type || '',
          description: l.description || '',
          link: l.link || '',
        })),
      };
    });
  }

  async getTask(userId: string, taskId: string, listId: string = '@default'): Promise<Task | null> {
    const tasks = await this.googleService.getTasksClient(userId);

    try {
      const response = await tasks.tasks.get({
        tasklist: listId,
        task: taskId,
      });

      const task = response.data;

      return {
        id: task.id!,
        listId,
        title: task.title || 'Sin título',
        notes: task.notes || undefined,
        due: task.due ? new Date(task.due) : undefined,
        status: task.status as 'needsAction' | 'completed',
        completed: task.completed ? new Date(task.completed) : undefined,
        parent: task.parent || undefined,
        position: task.position || undefined,
        links: task.links?.map((l) => ({
          type: l.type || '',
          description: l.description || '',
          link: l.link || '',
        })),
      };
    } catch (error) {
      this.logger.warn(`Task not found: ${taskId}`);
      return null;
    }
  }

  async getTaskByCalendarLink(userId: string, taskUrl: string): Promise<Task | null> {
    // Extract task ID from URL like https://tasks.google.com/task/pnV-JuW4hlddxlgR
    const match = taskUrl.match(/tasks\.google\.com\/task\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return null;
    }

    const taskId = match[1];

    // Try to find the task in all lists
    const lists = await this.getTaskLists(userId);

    for (const list of lists) {
      const task = await this.getTask(userId, taskId, list.id);
      if (task) {
        return task;
      }
    }

    return null;
  }

  async createTask(userId: string, data: CreateTaskDto): Promise<Task> {
    const tasks = await this.googleService.getTasksClient(userId);

    const requestBody: any = {
      title: data.title,
    };

    if (data.notes) {
      requestBody.notes = data.notes;
    }

    if (data.due) {
      requestBody.due = data.due.toISOString();
    }

    const listId = data.listId || '@default';

    const response = await tasks.tasks.insert({
      tasklist: listId,
      requestBody,
    });

    const task = response.data;

    this.logger.log(`Task created: ${task.id}`);

    return {
      id: task.id!,
      listId,
      title: task.title || data.title,
      notes: task.notes || undefined,
      due: task.due ? new Date(task.due) : undefined,
      status: task.status as 'needsAction' | 'completed',
      completed: task.completed ? new Date(task.completed) : undefined,
    };
  }

  async updateTask(
    userId: string,
    taskId: string,
    data: UpdateTaskDto,
    listId: string = '@default',
  ): Promise<Task> {
    const tasks = await this.googleService.getTasksClient(userId);

    const requestBody: any = {};

    if (data.title) requestBody.title = data.title;
    if (data.notes !== undefined) requestBody.notes = data.notes;
    if (data.due) requestBody.due = data.due.toISOString();
    if (data.status) requestBody.status = data.status;

    const response = await tasks.tasks.patch({
      tasklist: listId,
      task: taskId,
      requestBody,
    });

    const task = response.data;

    this.logger.log(`Task updated: ${taskId}`);

    return {
      id: task.id!,
      listId,
      title: task.title || 'Sin título',
      notes: task.notes || undefined,
      due: task.due ? new Date(task.due) : undefined,
      status: task.status as 'needsAction' | 'completed',
      completed: task.completed ? new Date(task.completed) : undefined,
    };
  }

  async completeTask(userId: string, taskId: string, listId: string = '@default'): Promise<Task> {
    return this.updateTask(userId, taskId, { status: 'completed' }, listId);
  }

  async deleteTask(userId: string, taskId: string, listId: string = '@default'): Promise<void> {
    const tasks = await this.googleService.getTasksClient(userId);

    await tasks.tasks.delete({
      tasklist: listId,
      task: taskId,
    });

    this.logger.log(`Task deleted: ${taskId}`);
  }
}
