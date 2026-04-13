import { Keypair } from '@stellar/stellar-sdk';
import type { PaymentInstructions } from './types.js';

export class StellarWallet {
  private readonly keypair: Keypair;

  constructor(secret: string) {
    this.keypair = Keypair.fromSecret(secret);
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  signPaymentChallenge(
    payment: PaymentInstructions,
    contentHash: string,
    idempotencyKey: string,
  ): string {
    const challenge = buildPaymentChallenge(
      payment,
      this.publicKey,
      contentHash,
      idempotencyKey,
    );
    const signature = this.keypair.sign(Buffer.from(challenge, 'utf8'));
    return Buffer.from(signature).toString('base64');
  }
}

function buildPaymentChallenge(
  payment: PaymentInstructions,
  payerAddress: string,
  contentHash: string,
  idempotencyKey: string,
): string {
  const canonicalData = {
    amount: payment.amount,
    asset: payment.asset,
    expiresAt: payment.expiresAt,
    idempotencyKey,
    network: payment.network,
    nonce: payment.nonce,
    payerAddress,
    resource: payment.resource,
    contentHash,
  };
  return JSON.stringify(canonicalData);
}
