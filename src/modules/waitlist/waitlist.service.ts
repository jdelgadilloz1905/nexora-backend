import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { JoinWaitlistDto, WaitlistResponseDto } from './dto/waitlist.dto';

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepository: Repository<WaitlistEntry>,
  ) {}

  async join(dto: JoinWaitlistDto): Promise<WaitlistResponseDto> {
    // Check if email already exists
    const existing = await this.waitlistRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      // Return success anyway to not reveal if email exists (privacy)
      const position = await this.getPosition(existing.email);
      return {
        success: true,
        message: 'Ya estás en la lista de espera. Te notificaremos pronto.',
        position,
      };
    }

    // Create new entry
    const entry = this.waitlistRepository.create({
      email: dto.email.toLowerCase(),
      name: dto.name,
      company: dto.company,
      source: dto.source || 'landing',
    });

    await this.waitlistRepository.save(entry);

    const position = await this.getPosition(entry.email);

    return {
      success: true,
      message: '¡Gracias por unirte! Te notificaremos cuando esté listo.',
      position,
    };
  }

  async getPosition(email: string): Promise<number> {
    const result = await this.waitlistRepository
      .createQueryBuilder('entry')
      .select('COUNT(*)', 'count')
      .where('entry.created_at <= (SELECT created_at FROM waitlist_entries WHERE email = :email)', { email: email.toLowerCase() })
      .getRawOne();

    return parseInt(result.count, 10);
  }

  async getCount(): Promise<number> {
    return this.waitlistRepository.count();
  }

  async getAll(): Promise<WaitlistEntry[]> {
    return this.waitlistRepository.find({
      order: { createdAt: 'ASC' },
    });
  }
}
