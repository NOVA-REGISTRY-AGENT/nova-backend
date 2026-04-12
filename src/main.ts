import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NovaRegistryExceptionFilter } from './nova-registry/nova-registry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new NovaRegistryExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
