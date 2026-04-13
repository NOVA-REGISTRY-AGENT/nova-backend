import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NovaRegistryExceptionFilter } from './nova-registry/nova-registry-exception.filter';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactStellarScheme } from '@x402/stellar/exact/server';
import {
  ADMIN_PUBLIC_KEY,
  FACILITATOR_URL_DEFAULT,
  REGISTRATION_PRICE,
} from './soroban/soroban.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new NovaRegistryExceptionFilter());

  // ── x402 payment middleware (OpenZeppelin Facilitator) ──────────────────────
  const facilitatorUrl = process.env.FACILITATOR_URL ?? FACILITATOR_URL_DEFAULT;
  const facilitatorApiKey = process.env.FACILITATOR_API_KEY ?? 'e860a717-453a-4e87-b1b3-def4a5373118';
  const payTo = process.env.STELLAR_PAYMENT_ADDRESS ?? ADMIN_PUBLIC_KEY;

  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
    createAuthHeaders: async () => ({
      verify: { Authorization: `Bearer ${facilitatorApiKey}` },
      settle: { Authorization: `Bearer ${facilitatorApiKey}` },
      supported: { Authorization: `Bearer ${facilitatorApiKey}` },
    }),
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    'stellar:testnet',
    new ExactStellarScheme(),
  );

  // Aplica el middleware ANTES de que NestJS maneje las rutas.
  // Si no hay payment-signature header → devuelve 402 con requisitos.
  // Si hay header → verifica con el facilitador, luego llama a next().
  // El pago se liquida (settle) automáticamente después de que el handler responde.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    paymentMiddleware(
      {
        'POST /soroban/register/submit': {
          accepts: {
            scheme: 'exact',
            network: 'stellar:testnet',
            price: REGISTRATION_PRICE,
            payTo,
            maxTimeoutSeconds: 300,
          },
          description: 'Nova Registry — Registro de hash musical en Stellar blockchain',
          mimeType: 'application/json',
          resource: '/soroban/register/submit',
        },
      },
      resourceServer,
    ),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`[Nova Registry] Backend corriendo en: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`[x402] Facilitador: ${facilitatorUrl}`);
  console.log(`[x402] PayTo: ${payTo}`);
}
bootstrap();
