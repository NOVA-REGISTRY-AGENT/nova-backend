import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Tipos del protocolo x402 v2 ─────────────────────────────────────────────

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown;
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason: string | null;
}

export interface SettleResult {
  success: boolean;
  txHash: string | null;
  networkId: string | null;
}

export interface SupportedKind {
  scheme: string;
  network: string;
  x402Version: number;
  extra?: Record<string, unknown>;
}

export interface SupportedResult {
  kinds: SupportedKind[];
  signers: Record<string, string[]>;
}

// ─── Cuerpo de la petición a verify/settle del facilitador ──────────────────

interface FacilitatorRequest {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown;
  requirements: PaymentRequirements;
}

/**
 * FacilitatorService — Wrapper del facilitador x402 de OpenZeppelin Relayer.
 *
 * Implementa las tres rutas del plugin:
 *   POST  {FACILITATOR_URL}/verify   → verifica un pago antes de procesar
 *   POST  {FACILITATOR_URL}/settle   → liquida el pago on-chain
 *   GET   {FACILITATOR_URL}/supported → descubrir qué payment kinds acepta
 *
 * URL del facilitador: FACILITATOR_URL en .env
 * API Key:             FACILITATOR_API_KEY en .env
 */
@Injectable()
export class FacilitatorService {
  private readonly logger = new Logger(FacilitatorService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config
      .getOrThrow<string>('FACILITATOR_URL')
      .replace(/\/$/, '');
    this.apiKey = config.getOrThrow<string>('FACILITATOR_API_KEY');
    this.timeoutMs = 20_000;
  }

  /**
   * Decodifica el header X-PAYMENT (base64 → JSON) enviado por el cliente.
   * Devuelve el objeto parseado o lanza si el formato es inválido.
   */
  decodeXPaymentHeader(xPaymentHeader: string): X402PaymentPayload {
    let decoded: string;
    try {
      decoded = Buffer.from(xPaymentHeader, 'base64').toString('utf8');
    } catch {
      throw new Error('X-PAYMENT header no es base64 válido');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      throw new Error('X-PAYMENT header no contiene JSON válido');
    }

    const p = parsed as Record<string, unknown>;
    if (!p['x402Version'] || !p['scheme'] || !p['network']) {
      throw new Error('X-PAYMENT header inválido: faltan campos x402Version, scheme o network');
    }

    return parsed as X402PaymentPayload;
  }

  /**
   * Llama a POST {FACILITATOR_URL}/verify
   * Verifica que el pago sea válido contra los requisitos dados.
   */
  async verify(
    paymentPayload: X402PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResult> {
    const body: FacilitatorRequest = {
      x402Version: paymentPayload.x402Version,
      scheme: paymentPayload.scheme,
      network: paymentPayload.network,
      payload: paymentPayload.payload,
      requirements,
    };

    this.logger.debug(`[verify] Llamando a ${this.baseUrl}/verify`);
    const result = await this.callFacilitator<VerifyResult>('verify', body);
    this.logger.debug(`[verify] isValid=${result.isValid}, razón=${result.invalidReason}`);
    return result;
  }

  /**
   * Llama a POST {FACILITATOR_URL}/settle
   * Liquida el pago on-chain a través del relayer de OpenZeppelin.
   */
  async settle(
    paymentPayload: X402PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResult> {
    const body: FacilitatorRequest = {
      x402Version: paymentPayload.x402Version,
      scheme: paymentPayload.scheme,
      network: paymentPayload.network,
      payload: paymentPayload.payload,
      requirements,
    };

    this.logger.debug(`[settle] Llamando a ${this.baseUrl}/settle`);
    const result = await this.callFacilitator<SettleResult>('settle', body);
    this.logger.log(`[settle] success=${result.success}, txHash=${result.txHash}`);
    return result;
  }

  /**
   * Llama a GET {FACILITATOR_URL}/supported
   * Devuelve los payment kinds que acepta el facilitador.
   */
  async getSupported(): Promise<SupportedResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/supported`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      const data = await response.json() as SupportedResult;
      return data;
    } catch (error) {
      throw this.normalizeError(error, 'supported');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Utilidades privadas ─────────────────────────────────────────────────

  private async callFacilitator<T>(
    route: 'verify' | 'settle',
    body: FacilitatorRequest,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '(sin cuerpo)');
        throw new Error(
          `Facilitador respondió ${response.status} en /${route}: ${text}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      throw this.normalizeError(error, route);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeError(error: unknown, route: string): Error {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return new Error(`Timeout calling facilitator /${route} (${this.timeoutMs}ms)`);
      }
      return error;
    }
    return new Error(`Error desconocido llamando a facilitador /${route}`);
  }
}
