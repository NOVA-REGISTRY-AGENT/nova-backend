export type StellarNetwork = 'testnet' | 'mainnet';

export interface NovaRegistrySDKConfig {
  stellarSecret: string;
  registryUrl: string;
  network?: StellarNetwork;
  timeoutMs?: number;
}

export interface RegisterAssetInput {
  contentHash: string;
  fileName?: string;
  title?: string;
  artist?: string;
  ownerAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInstructions {
  amount: string;
  asset: string;
  network: string;
  resource: string;
  nonce: string;
  expiresAt: string;
  facilitator?: string;
  requiredHeaders?: string[];
}

export interface PaymentRequiredResponse {
  error: 'payment_required';
  message: string;
  payment: PaymentInstructions;
}

export interface RegisterAcceptedResponse {
  requestId: string;
  status: 'queued' | 'processing' | 'confirmed' | 'failed';
  paymentStatus?: 'confirmed' | 'failed' | 'pending';
  message?: string;
}

export interface RegisterStatusResponse {
  requestId: string;
  status: 'queued' | 'processing' | 'confirmed' | 'failed';
  paymentStatus?: 'confirmed' | 'failed' | 'pending';
  certificateId: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt?: string;
}

export interface CertificateResponse {
  certificateId: string;
  title?: string;
  artist?: string;
  contentHash: string;
  ownerAddress: string;
  network: string;
  contractId?: string;
  txHash: string;
  explorerUrl: string;
  registeredAt: string;
  metadata?: Record<string, unknown>;
}

export class NovaRegistryError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'NovaRegistryError';
    this.status = status;
    this.details = details;
  }
}
