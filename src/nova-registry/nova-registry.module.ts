import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NovaRegistrySDK } from './sdk/index.js';
import { NovaRegistryService } from './nova-registry.service';
import { NOVA_REGISTRY_SDK } from './nova-registry.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: NOVA_REGISTRY_SDK,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new NovaRegistrySDK({
          stellarSecret: config.getOrThrow<string>('STELLAR_SECRET'),
          registryUrl: config.getOrThrow<string>('NOVA_REGISTRY_URL'),
          network:
            config.get<'testnet' | 'mainnet'>('STELLAR_NETWORK') ?? 'testnet',
          timeoutMs: 20_000,
        }),
    },
    NovaRegistryService,
  ],
  exports: [NovaRegistryService],
})
export class NovaRegistryModule {}
