import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class GetPresignedUrlDto {
  @ApiProperty({ example: 'profile.jpg', description: 'Name of the file' })
  @IsString()
  fileName: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type of the file',
  })
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif'], {
    message: 'Solo se permiten imágenes (JPEG, PNG, WebP, GIF)',
  })
  contentType: string;
}

export class PresignedUrlResponseDto {
  @ApiProperty({ description: 'URL to upload the file directly to S3' })
  uploadUrl: string;

  @ApiProperty({ description: 'Public URL of the file after upload' })
  fileUrl: string;

  @ApiProperty({ description: 'S3 key of the file' })
  key: string;
}
