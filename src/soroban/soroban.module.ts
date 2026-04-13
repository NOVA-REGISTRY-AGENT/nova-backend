import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SorobanController } from './soroban.controller';
import { SorobanService } from './soroban.service';
import { FacilitatorService } from './facilitator.service';

@Module({
  imports: [ConfigModule],
  controllers: [SorobanController],
  providers: [SorobanService, FacilitatorService],
  exports: [SorobanService, FacilitatorService],
})
export class SorobanModule {}
