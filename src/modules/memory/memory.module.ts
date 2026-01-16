import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserMemory } from './entities/user-memory.entity';
import { MemoryService } from './memory.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserMemory])],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
