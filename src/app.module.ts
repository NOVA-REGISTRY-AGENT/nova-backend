import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NovaRegistryModule } from './nova-registry/nova-registry.module';
import { AssetsController } from './assets/assets.controller';
import { SorobanModule } from './soroban/soroban.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NovaRegistryModule,
    SorobanModule,
  ],
  controllers: [AppController, AssetsController],
  providers: [AppService],
})
export class AppModule {}
