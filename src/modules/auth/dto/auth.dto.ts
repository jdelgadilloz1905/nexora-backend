import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  avatarUrl?: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token from email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://bucket.s3.amazonaws.com/avatars/user-id/image.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPass123!' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  newPassword: string;
}

// ============================================
// User Preferences DTOs
// ============================================

export type Platform = 'google' | 'microsoft' | 'notion' | 'nexora';

export class PlatformPreferenceDto {
  @ApiProperty({
    enum: ['google', 'microsoft', 'notion', 'nexora'],
    example: 'google',
    description: 'Primary platform for this action type',
  })
  @IsString()
  primary: Platform;

  @ApiPropertyOptional({
    enum: ['google', 'microsoft', 'notion', 'nexora'],
    example: 'nexora',
    description: 'Fallback platform if primary is not available',
  })
  @IsOptional()
  @IsString()
  fallback?: Platform;
}

export class UserPreferencesDto {
  @ApiPropertyOptional({
    description: 'Preferred platform for creating tasks',
    type: PlatformPreferenceDto,
  })
  @IsOptional()
  tasks?: PlatformPreferenceDto;

  @ApiPropertyOptional({
    description: 'Preferred platform for creating calendar events',
    type: PlatformPreferenceDto,
  })
  @IsOptional()
  events?: PlatformPreferenceDto;

  @ApiPropertyOptional({
    description: 'Preferred platform for scheduling meetings',
    type: PlatformPreferenceDto,
  })
  @IsOptional()
  meetings?: PlatformPreferenceDto;

  @ApiPropertyOptional({
    description: 'Preferred platform for sending emails',
    type: PlatformPreferenceDto,
  })
  @IsOptional()
  emails?: PlatformPreferenceDto;

  @ApiPropertyOptional({
    description: 'Preferred platform for storing notes/documents',
    type: PlatformPreferenceDto,
  })
  @IsOptional()
  notes?: PlatformPreferenceDto;

  @ApiPropertyOptional({
    example: 'es',
    description: 'Preferred language (es, en)',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: 'America/Bogota',
    description: 'User timezone',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable AI learning from user patterns',
  })
  @IsOptional()
  enableLearning?: boolean;
}

export class UpdatePreferencesDto extends UserPreferencesDto {}

export class PreferencesResponseDto {
  @ApiProperty({ type: UserPreferencesDto })
  preferences: UserPreferencesDto;

  @ApiProperty({
    description: 'Connected integrations status',
    example: { google: true, microsoft: false, notion: false },
  })
  connectedPlatforms: Record<Platform, boolean>;
}
