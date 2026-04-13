/**
 * Genera el header X-PAYMENT para el endpoint POST /soroban/register/submit
 *
 * Uso:
 *   node scripts/generate-x-payment.mjs
 *
 * Requiere que el backend esté corriendo (para el 402 ya lo tienes).
 * Copia el valor de X-PAYMENT que imprime y pégalo en Postman.
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Account,
} from '@stellar/stellar-sdk';

// ─── CONFIGURACIÓN — pon aquí tus datos ──────────────────────────────────────

const OWNER_SECRET = 'clave'; // tu clave secreta

// Datos del 402 que recibiste:
const PAY_TO      = 'GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4';
const AMOUNT      = '0.5';       // 5000000 stroops = 0.5 XLM
const NETWORK     = Networks.TESTNET;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// ─────────────────────────────────────────────────────────────────────────────

if (OWNER_SECRET.startsWith('SXXX')) {
  console.error('❌ Edita OWNER_SECRET con tu clave secreta real antes de ejecutar.');
  process.exit(1);
}

const ownerKeypair = Keypair.fromSecret(OWNER_SECRET);
console.log('✅ Owner public key:', ownerKeypair.publicKey());

// 1. Obtener el número de secuencia de la cuenta en Horizon
const resp = await fetch(`${HORIZON_URL}/accounts/${ownerKeypair.publicKey()}`);
if (!resp.ok) {
  console.error('❌ Cuenta no encontrada en Testnet. Fondéala en https://laboratory.stellar.org/friendbot');
  process.exit(1);
}
const accountData = await resp.json();
const account = new Account(ownerKeypair.publicKey(), accountData.sequence);

// 2. Construir la transacción de pago
const tx = new TransactionBuilder(account, {
  fee: '100',              // fee mínimo (el facilitador lo sponsor si areFeesSponsored=true)
  networkPassphrase: NETWORK,
})
  .addOperation(
    Operation.payment({
      destination: PAY_TO,
      asset: Asset.native(),
      amount: AMOUNT,
    }),
  )
  .setTimeout(300)
  .build();

// 3. Firmar con el keypair del owner
tx.sign(ownerKeypair);
const signedXdr = tx.toXDR();

// 4. Construir el JSON del payload x402 v2
const payloadJson = {
  x402Version: 2,
  scheme: 'exact',
  network: 'stellar:testnet',
  payload: {
    signedTransaction: signedXdr,
    type: 'stellar',
  },
};

// 5. Codificar en base64
const xPaymentHeader = Buffer.from(JSON.stringify(payloadJson)).toString('base64');

console.log('\n─────────────────────────────────────────────────────────────────');
console.log('📋 Copia este valor como header X-PAYMENT en Postman:\n');
console.log(xPaymentHeader);
console.log('\n─────────────────────────────────────────────────────────────────');
console.log('\n📦 JSON interno (para referencia):');
console.log(JSON.stringify(payloadJson, null, 2));
