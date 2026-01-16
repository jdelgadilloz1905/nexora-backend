import { IsString, IsEnum, IsOptional, IsNumber, Min, Max, IsObject } from 'class-validator';
import { MemoryType, MemoryMetadata } from '../entities/user-memory.entity';

export class CreateMemoryDto {
  @IsEnum(MemoryType)
  type: MemoryType;

  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  importance?: number;

  @IsOptional()
  @IsObject()
  metadata?: MemoryMetadata;
}

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  importance?: number;

  @IsOptional()
  @IsObject()
  metadata?: MemoryMetadata;

  @IsOptional()
  isActive?: boolean;
}

export class SearchMemoryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
