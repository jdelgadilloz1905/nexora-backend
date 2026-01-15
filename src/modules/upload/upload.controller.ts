import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';
import { GetPresignedUrlDto, PresignedUrlResponseDto } from './dto/upload.dto';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-url/avatar')
  @ApiOperation({ summary: 'Get presigned URL for avatar upload' })
  @ApiResponse({
    status: 200,
    description: 'Presigned URL generated successfully',
    type: PresignedUrlResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAvatarPresignedUrl(
    @Req() req: { user: { userId: string } },
    @Body() dto: GetPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    return this.uploadService.getPresignedUploadUrl(
      req.user.userId,
      dto.fileName,
      dto.contentType,
      'avatars',
    );
  }
}
