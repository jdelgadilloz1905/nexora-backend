import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from './entities/user.entity';
import {
  VerificationToken,
  TokenType,
} from './entities/verification-token.entity';
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  ResetPasswordDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { EmailService } from '@/modules/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VerificationToken)
    private readonly tokenRepository: Repository<VerificationToken>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isEmailVerified: false,
    });

    await this.userRepository.save(user);

    // Create verification token
    await this.createAndSendVerificationToken(user);

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    return this.generateTokens(user);
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const verificationToken = await this.tokenRepository.findOne({
      where: {
        token,
        type: TokenType.EMAIL_VERIFICATION,
      },
      relations: ['user'],
    });

    if (!verificationToken) {
      throw new BadRequestException('Invalid verification token');
    }

    if (verificationToken.isUsed()) {
      throw new BadRequestException('Token has already been used');
    }

    if (verificationToken.isExpired()) {
      throw new BadRequestException(
        'Token has expired. Please request a new verification email.',
      );
    }

    // Mark token as used
    verificationToken.usedAt = new Date();
    await this.tokenRepository.save(verificationToken);

    // Verify user email
    const user = verificationToken.user;
    user.isEmailVerified = true;
    await this.userRepository.save(user);

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.firstName);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists
      return {
        message: 'If an account exists, a verification email has been sent.',
      };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Check for recent token (prevent spam)
    const recentToken = await this.tokenRepository.findOne({
      where: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        createdAt: MoreThan(new Date(Date.now() - 60000)), // 1 minute
      },
    });

    if (recentToken) {
      throw new BadRequestException(
        'Please wait at least 1 minute before requesting a new verification email',
      );
    }

    await this.createAndSendVerificationToken(user);

    return {
      message: 'If an account exists, a verification email has been sent.',
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl;
    }

    await this.userRepository.save(user);
    return user;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!user.password) {
      throw new BadRequestException('Este usuario no tiene contraseña configurada');
    }

    const isCurrentPasswordValid = bcrypt.compareSync(
      dto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    // Always return success message to not reveal if user exists
    const successMessage = {
      message:
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.',
    };

    if (!user) {
      return successMessage;
    }

    // Check for recent token (prevent spam)
    const recentToken = await this.tokenRepository.findOne({
      where: {
        userId: user.id,
        type: TokenType.PASSWORD_RESET,
        createdAt: MoreThan(new Date(Date.now() - 60000)), // 1 minute
      },
    });

    if (recentToken) {
      throw new BadRequestException(
        'Por favor espera al menos 1 minuto antes de solicitar otro enlace',
      );
    }

    await this.createAndSendPasswordResetToken(user);

    return successMessage;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const resetToken = await this.tokenRepository.findOne({
      where: {
        token: dto.token,
        type: TokenType.PASSWORD_RESET,
      },
      relations: ['user'],
    });

    if (!resetToken) {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (resetToken.isUsed()) {
      throw new BadRequestException('Este enlace ya fue utilizado');
    }

    if (resetToken.isExpired()) {
      throw new BadRequestException(
        'El enlace ha expirado. Por favor solicita uno nuevo.',
      );
    }

    // Mark token as used
    resetToken.usedAt = new Date();
    await this.tokenRepository.save(resetToken);

    // Update user password
    const user = resetToken.user;
    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.' };
  }

  private async createAndSendPasswordResetToken(user: User): Promise<void> {
    // Invalidate any existing password reset tokens
    await this.tokenRepository.update(
      {
        userId: user.id,
        type: TokenType.PASSWORD_RESET,
        usedAt: undefined,
      },
      { usedAt: new Date() },
    );

    // Create new token (valid for 15 minutes)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const resetToken = this.tokenRepository.create({
      token,
      type: TokenType.PASSWORD_RESET,
      userId: user.id,
      expiresAt,
    });

    await this.tokenRepository.save(resetToken);

    // Send email
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.firstName,
      token,
    );
  }

  private async createAndSendVerificationToken(user: User): Promise<void> {
    // Invalidate any existing tokens
    await this.tokenRepository.update(
      {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: undefined,
      },
      { usedAt: new Date() },
    );

    // Create new token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes

    const verificationToken = this.tokenRepository.create({
      token,
      type: TokenType.EMAIL_VERIFICATION,
      userId: user.id,
      expiresAt,
    });

    await this.tokenRepository.save(verificationToken);

    // Send email
    await this.emailService.sendVerificationEmail(
      user.email,
      user.firstName,
      token,
    );
  }

  private generateTokens(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
