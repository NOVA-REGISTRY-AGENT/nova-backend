# x402 Payment Implementation — Nova Registry Backend

## Arquitectura

```
Cliente (Agent/Postman)
        │
        │ POST /soroban/register/submit
        │ Header: payment-signature: <base64(PaymentPayloadV2)>
        ▼
┌─────────────────────────────────────┐
│  NestJS + @x402/express middleware  │
│                                     │
│  paymentMiddleware(routes, server)  │
│     1. Lee "payment-signature"      │
│        o "x-payment" header         │
│     2. Si no hay header → 402 ◄─── │─► devuelve X-PAYMENT-REQUIRED header
│     3. Si hay header:               │
│        a. Llama a /verify ─────────►│─► OZ Facilitator (ngrok)
│        b. Llama a next() ──────────►│─► NestJS Controller
│        c. Llama a /settle ─────────►│─► OZ Facilitator (on-chain)
└─────────────────────────────────────┘
        │
        │ next() → handler solo se ejecuta si el pago es válido
        ▼
┌─────────────────────────────────────┐
│  SorobanController.submitRegister() │
│  → sorobanService.submitRegisterHash│
│  → Contrato Nova Registry (Testnet) │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Stellar Soroban Testnet            │
│  Contract: CDNBMD3AA6QPW4SR2...    │
└─────────────────────────────────────┘
```

## Paquetes utilizados

| Paquete | Propósito |
|---------|-----------|
| `@x402/express` | Middleware Express que implementa el protocolo x402 v2 completo |
| `@x402/core/server` | `x402ResourceServer`, `HTTPFacilitatorClient` |
| `@x402/stellar/exact/server` | `ExactStellarScheme` — maneja el esquema de pago USDC Stellar |

## Configuración del Middleware (main.ts)

```typescript
// 1. Cliente HTTP hacia el Facilitador (OpenZeppelin Relayer)
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL,         // URL ngrok del facilitador OZ
  createAuthHeaders: async () => ({
    verify:    { Authorization: `Bearer ${API_KEY}` },
    settle:    { Authorization: `Bearer ${API_KEY}` },
    supported: { Authorization: `Bearer ${API_KEY}` },
  }),
});

// 2. Resource server con el esquema Stellar USDC (testnet)
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register('stellar:testnet', new ExactStellarScheme());

// 3. Middleware aplicado a la ruta protegida
expressApp.use(paymentMiddleware(
  {
    'POST /soroban/register/submit': {
      accepts: {
        scheme: 'exact',
        network: 'stellar:testnet',
        price: '$0.10',          // ExactStellarScheme lo convierte a 1_000_000 stroops USDC
        payTo: ADMIN_PUBLIC_KEY, // GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4
        maxTimeoutSeconds: 300,
      },
    },
  },
  resourceServer,
));
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `STELLAR_SECRET_KEY` | Clave secreta del admin Stellar (firma transacciones Soroban) | — |
| `FACILITATOR_URL` | URL del facilitador OZ (puede cambiar con cada deploy de ngrok) | `https://dot-revealable-telescopically.ngrok-free.dev/api/v1/plugins/x402/call` |
| `FACILITATOR_API_KEY` | API key del facilitador OpenZeppelin | `e860a717-453a-4e87-b1b3-def4a5373118` |
| `STELLAR_PAYMENT_ADDRESS` | Dirección que recibe los pagos (override del admin default) | `GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4` |
| `PORT` | Puerto HTTP | `3000` |

## Flujo de Pago Completo (Paso a Paso)

### Paso 1 — Obtener el auth entry (GRATIS, sin pago)

```bash
POST http://localhost:3000/soroban/register/prepare
Content-Type: application/json

{
  "hash": "abc123...",
  "ownerAddress": "GBNFEBMA6SQBSIDF63E2KQZYPYPMM2YXIQPSHQ7BMZHZBDXKRJ2M2S4O"
}
```

Respuesta:
```json
{
  "ownerAuthEntryXdr": "AAAAAgAAAA...",
  "latestLedger": 12345,
  "expirationLedger": 12445
}
```

### Paso 2 — Generar el payment-signature header

Usa el script `generate-x-payment.mjs`:

```bash
# Requiere: OWNER_SECRET en el entorno
OWNER_SECRET=SXXXXX node scripts/generate-x-payment.mjs
```

El script usa `@x402/stellar` para:
1. Crear una transacción Stellar que transfiere 0.10 USDC (1_000_000 stroops)
2. Desde: cuenta del owner (`GBNFEBMA6...`)
3. Hacia: admin backend (`GC6XSCIHDDZYO4...`)
4. Asset: USDC SAC Testnet (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`)
5. Serializa como `PaymentPayloadV2` en base64

Salida:
```
payment-signature: eyJ4NDAyVmVyc2lvbiI6Mix...
```

### Paso 3 — Firmar el auth entry (owner)

```javascript
import { Keypair } from '@stellar/stellar-sdk';
import { authorizeEntry } from '@stellar/stellar-sdk/contract';

const ownerKeypair = Keypair.fromSecret(OWNER_SECRET);
const signedXdr = await authorizeEntry(
  ownerAuthEntryXdr,
  ownerKeypair,
  expirationLedger,
  Networks.TESTNET,
);
```

### Paso 4 — Enviar el registro (CON pago)

```bash
POST http://localhost:3000/soroban/register/submit
Content-Type: application/json
payment-signature: eyJ4NDAyVmVyc2lvbiI6Mix...

{
  "hash": "abc123...",
  "ownerAddress": "GBNFEBMA6SQBSIDF63E2KQZYPYPMM2YXIQPSHQ7BMZHZBDXKRJ2M2S4O",
  "ownerSignedAuthEntryXdr": "AAAAAgAAAA..."
}
```

**Flujo interno:**
1. `paymentMiddleware` lee el header `payment-signature`
2. Llama a `facilitatorClient.verify()` → OZ Facilitator valida la transacción
3. Llama a `next()` → NestJS controller ejecuta `submitRegisterHash()`
4. La transacción Soroban se aprueba y confirma
5. `paymentMiddleware` llama a `facilitatorClient.settle()` → OZ Facilitator liquida el pago USDC on-chain
6. El header `X-PAYMENT-RESPONSE` se añade a la respuesta con el txHash del settle

Respuesta exitosa:
```json
{
  "success": true,
  "txHash": "a1b2c3...",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3...",
  "certificate": {
    "hash": "abc123...",
    "owner": "GBNFEBMA6...",
    "timestamp": 1700000000,
    "registeredAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Sin payment-signature → Respuesta 402

```json
HTTP 402 Payment Required
X-PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbi...

{
  "x402Version": 2,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "stellar:testnet",
    "amount": "1000000",
    "asset": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "payTo": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
    "maxTimeoutSeconds": 300,
    "extra": { "areFeesSponsored": true }
  }]
}
```

## Cuentas de Testnet

| Cuenta | Dirección |
|--------|-----------|
| Admin (backend) | `GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4` |
| Test owner | `GBNFEBMA6SQBSIDF63E2KQZYPYPMM2YXIQPSHQ7BMZHZBDXKRJ2M2S4O` |

**Ambas cuentas necesitan:**
- Fondos XLM: https://friendbot.stellar.org/?addr=<ADDRESS>
- Trustline USDC (testnet): `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Fondos USDC: https://faucet.circle.com/ (seleccionar Stellar Testnet)

## Scripts de Testing

```bash
# Configurar cuenta de owner (Friendbot + trustline USDC)
node scripts/setup-test-account.mjs

# Flujo E2E completo: prepare → firmar → pagar → submit
OWNER_SECRET=SXXXXX node scripts/test-x402-flow.mjs

# Solo generar el header payment-signature (para Postman)
OWNER_SECRET=SXXXXX node scripts/generate-x-payment.mjs
```

## Contratos y Redes

| Recurso | Valor |
|---------|-------|
| Nova Registry Contract | `CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD` |
| Soroban RPC Testnet | `https://soroban-testnet.stellar.org` |
| USDC SAC Testnet | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Explorer (contrato) | https://stellar.expert/explorer/testnet/contract/CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD |

## Notas de Implementación

- **`ExactStellarScheme`** convierte `'$0.10'` automáticamente a `'1000000'` stroops de USDC testnet. No es necesario especificar el asset en la config del middleware.
- **El settle ocurre DESPUÉS** de que el handler de NestJS responde exitosamente. Si el handler retorna 4xx/5xx, el settle **no** se ejecuta (el pago no se liquida).
- **`createAuthHeaders`** es una función asíncrona que devuelve headers por operación (`verify`, `settle`, `supported`). El OZ Facilitator requiere `Authorization: Bearer <API_KEY>`.
- **El middleware lee** `payment-signature` OR `x-payment` headers (ambos son válidos).
