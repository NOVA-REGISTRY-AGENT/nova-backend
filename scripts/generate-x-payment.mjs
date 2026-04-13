/**
 * Genera el header payment-signature para el endpoint POST /soroban/register/submit
 *
 * Spec x402 v2 — ExactStellarScheme:
 *   - Transacción invokeHostFunction que llama transfer(from, to, amount) en el USDC SAC.
 *   - PaymentPayloadV2 = { x402Version:2, accepted: {scheme,network,amount,asset,payTo,...}, payload: { transaction: XDR } }
 *
 * Uso:
 *   node scripts/generate-x-payment.mjs
 *
 * El header generado se usa como "payment-signature" en Postman.
 */

import {
  Keypair,
  Networks,
  hash,
} from '@stellar/stellar-sdk';
import { contract } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/client';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const OWNER_SECRET = 'wallet secret';

const PAYMENT_REQUIREMENTS = {
  scheme: 'exact',
  network: 'stellar:testnet',
  amount: '1000000',                  // 0.10 USDC (7 decimal places: 0.10 × 10^7)
  asset: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',  // USDC SAC Testnet
  payTo: 'GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4',
  maxTimeoutSeconds: 300,
  extra: { areFeesSponsored: true },  // OZ Relayer patrocina gas
};

// ─────────────────────────────────────────────────────────────────────────────

const ownerKeypair = Keypair.fromSecret(OWNER_SECRET);
console.log('✅ Owner:', ownerKeypair.publicKey());
console.log('💸 Pago : 0.10 USDC →', PAYMENT_REQUIREMENTS.payTo);

// Verificar balance USDC
console.log('\n[0/3] Verificando balance USDC...');
const acct = await fetch(`https://horizon-testnet.stellar.org/accounts/${ownerKeypair.publicKey()}`);
if (!acct.ok) {
  console.error('❌ Cuenta no encontrada. Fondéala en https://friendbot.stellar.org/?addr=' + ownerKeypair.publicKey());
  process.exit(1);
}
const acctData = await acct.json();
const usdcBalance = acctData.balances?.find(b => b.asset_code === 'USDC')?.balance ?? '0';
console.log(`   USDC balance: ${usdcBalance}`);
if (parseFloat(usdcBalance) < 0.10) {
  console.error('❌ Saldo USDC insuficiente. Necesitas al menos 0.10 USDC.');
  console.error('   Obtén USDC testnet en: https://faucet.circle.com/ (selecciona "Stellar Testnet")');
  console.error(`   Dirección owner: ${ownerKeypair.publicKey()}`);
  process.exit(1);
}

// Implementar signer compatible con @x402/stellar/exact/client
const signer = {
  address: ownerKeypair.publicKey(),
  signAuthEntry: async (authEntryXdr) => {
    // Firma el preimage del auth entry (hash SHA-256 del XDR base64)
    const signedAuthEntry = ownerKeypair
      .sign(hash(Buffer.from(authEntryXdr, 'base64')))
      .toString('base64');
    return { signedAuthEntry, signerAddress: ownerKeypair.publicKey() };
  },
};

// Construir el payment payload usando ExactStellarScheme (cliente oficial)
console.log('\n[1/3] Construyendo transacción USDC (transfer via SAC)...');
const scheme = new ExactStellarScheme(signer);
const partialPayload = await scheme.createPaymentPayload(2, PAYMENT_REQUIREMENTS);
console.log('   Transacción XDR generada:', partialPayload.payload.transaction.slice(0, 60) + '...');

// Ensamblar PaymentPayloadV2 completo con el campo "accepted"
console.log('\n[2/3] Ensamblando PaymentPayloadV2...');
const paymentPayloadV2 = {
  x402Version: 2,
  accepted: PAYMENT_REQUIREMENTS,
  payload: partialPayload.payload,
};

// Codificar en base64
const paymentSignatureHeader = Buffer.from(JSON.stringify(paymentPayloadV2)).toString('base64');

console.log('\n[3/3] ✅ Header generado\n');
console.log('─────────────────────────────────────────────────────────────────');
console.log('📋 Header para Postman (key: payment-signature):\n');
console.log(paymentSignatureHeader);
console.log('\n─────────────────────────────────────────────────────────────────');
console.log('\n📦 Estructura PaymentPayloadV2:');
console.log(JSON.stringify({
  x402Version: 2,
  accepted: PAYMENT_REQUIREMENTS,
  payload: { transaction: partialPayload.payload.transaction.slice(0, 60) + '...' },
}, null, 2));


