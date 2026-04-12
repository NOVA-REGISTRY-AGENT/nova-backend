import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SorobanController } from './soroban.controller';
import { SorobanService } from './soroban.service';

@Module({
  imports: [ConfigModule],
  controllers: [SorobanController],
  providers: [SorobanService],
  exports: [SorobanService],
})
export class SorobanModule {}
