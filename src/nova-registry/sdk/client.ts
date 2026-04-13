import { randomUUID } from 'node:crypto';
import {
  NovaRegistryError,
  type CertificateResponse,
  type NovaRegistrySDKConfig,
  type PaymentRequiredResponse,
  type RegisterAcceptedResponse,
  type RegisterAssetInput,
  type RegisterStatusResponse,
} from './types.js';
import { StellarWallet } from './wallet.js';

interface JsonResponse<T> {
  status: number;
  data: T;
}

export class NovaRegistrySDK {
  private readonly wallet: StellarWallet;
  private readonly registryUrl: string;
  private readonly timeoutMs: number;
  private readonly network: 'testnet' | 'mainnet';

  constructor(config: NovaRegistrySDKConfig) {
    if (!config.stellarSecret) {
      throw new Error('stellarSecret is required');
    }
    if (!config.registryUrl) {
      throw new Error('registryUrl is required');
    }
    this.wallet = new StellarWallet(config.stellarSecret);
    this.registryUrl = config.registryUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.network = config.network ?? 'testnet';
  }

  get payerAddress(): string {
    return this.wallet.publicKey;
  }

  async registerAsset(
    input: RegisterAssetInput,
  ): Promise<RegisterAcceptedResponse> {
    const payload = {
      ...input,
      ownerAddress: input.ownerAddress ?? this.wallet.publicKey,
    };

    const firstAttempt = await this.postJson<
      RegisterAcceptedResponse | PaymentRequiredResponse
    >('/v1/register', payload);

    if (firstAttempt.status >= 200 && firstAttempt.status < 300) {
      return firstAttempt.data as RegisterAcceptedResponse;
    }

    if (!isPaymentRequired(firstAttempt.status, firstAttempt.data)) {
      throw new NovaRegistryError(
        'Failed to register asset',
        firstAttempt.status,
        firstAttempt.data,
      );
    }

    const idempotencyKey = randomUUID();
    const payment = (firstAttempt.data as PaymentRequiredResponse).payment;
    const paymentSignature = this.wallet.signPaymentChallenge(
      payment,
      input.contentHash,
      idempotencyKey,
    );

    const secondAttempt = await this.postJson<RegisterAcceptedResponse>(
      '/v1/register',
      payload,
      {
        'payment-signature': paymentSignature,
        'x-idempotency-key': idempotencyKey,
        'x-payment-nonce': payment.nonce,
        'x-stellar-public-key': this.wallet.publicKey,
        'x-stellar-network': this.network,
      },
    );

    if (secondAttempt.status < 200 || secondAttempt.status >= 300) {
      throw new NovaRegistryError(
        'Payment was signed but registration failed',
        secondAttempt.status,
        secondAttempt.data,
      );
    }

    return secondAttempt.data;
  }

  async getRegistrationStatus(
    requestId: string,
  ): Promise<RegisterStatusResponse> {
    const response = await this.getJson<RegisterStatusResponse>(
      `/v1/register/${encodeURIComponent(requestId)}`,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError(
        'Failed to fetch registration status',
        response.status,
        response.data,
      );
    }
    return response.data;
  }

  async getCertificate(certificateId: string): Promise<CertificateResponse> {
    const response = await this.getJson<CertificateResponse>(
      `/v1/certificates/${encodeURIComponent(certificateId)}`,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError(
        'Failed to fetch certificate',
        response.status,
        response.data,
      );
    }
    return response.data;
  }

  async getCertificateByHash(
    contentHash: string,
  ): Promise<{ exists: boolean; certificateId?: string; txHash?: string }> {
    const response = await this.getJson<{
      exists: boolean;
      certificateId?: string;
      txHash?: string;
    }>(`/v1/certificates/by-hash/${encodeURIComponent(contentHash)}`);
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError(
        'Failed to fetch certificate by hash',
        response.status,
        response.data,
      );
    }
    return response.data;
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<JsonResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.registryUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: response.status, data: (await parseJson(response)) as T };
    } catch (error) {
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async getJson<T>(path: string): Promise<JsonResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.registryUrl}${path}`, {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
      });
      return { status: response.status, data: (await parseJson(response)) as T };
    } catch (error) {
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function isPaymentRequired(
  status: number,
  data: unknown,
): data is PaymentRequiredResponse {
  return (
    status === 402 &&
    typeof data === 'object' &&
    data !== null &&
    'payment' in data
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new Error('Nova Registry SDK request timed out');
    }
    return error;
  }
  return new Error('Unknown network error');
}
