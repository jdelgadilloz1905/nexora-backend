import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskQueryDto,
  TaskResponseDto,
  PaginatedTasksResponseDto,
} from './dto/task.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

@ApiTags('Tasks')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, type: TaskResponseDto })
  create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks with optional filters' })
  @ApiResponse({ status: 200, type: PaginatedTasksResponseDto })
  findAll(
    @Req() req: { user: { userId: string } },
    @Query() query: TaskQueryDto,
  ) {
    return this.tasksService.findAll(req.user.userId, query);
  }

  @Get('briefing')
  @ApiOperation({ summary: 'Get today\'s briefing summary' })
  @ApiResponse({ status: 200, description: 'Daily briefing with prioritized tasks' })
  getTodaysBriefing(@Req() req: { user: { userId: string } }) {
    return this.tasksService.getTodaysBriefing(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(
    @Req() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.findOne(req.user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(
    @Req() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.userId, id, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark a task as completed' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  complete(
    @Req() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.complete(req.user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task (soft delete)' })
  @ApiResponse({ status: 200, description: 'Task deleted' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  remove(
    @Req() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.remove(req.user.userId, id);
  }
}
