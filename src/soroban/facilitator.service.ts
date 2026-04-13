import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, hash } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import {
  ADMIN_PUBLIC_KEY,
  XLM_SAC_TESTNET,
} from './soroban.constants';

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

// ── Tipos x402 v2 ────────────────────────────────────────────────────────────

/** Requisitos de pago x402 v2 (campo "accepted" / "paymentRequirements") */
interface PaymentRequirementsV2 {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

interface PayerPreflight {
  requiredAmount: string;
  xlmBalance: string;
  isSufficient: boolean;
}

/** PaymentPayloadV2 — lo que el cliente envía al servidor x402 */
interface PaymentPayloadV2 {
  x402Version: 2;
  accepted: PaymentRequirementsV2;
  payload: { transaction: string };
  resource?: { url: string; description?: string; mimeType?: string };
}

/** Cuerpo que el HTTPFacilitatorClient envía a /verify y /settle */
interface FacilitatorV2Request {
  x402Version: 2;
  paymentPayload: PaymentPayloadV2;
  paymentRequirements: PaymentRequirementsV2;
}

export interface TestX402PaymentResult {
  payerAddress: string;
  paymentRequirements: PaymentRequirementsV2;
  preflight: PayerPreflight;
  verify: VerifyResult | null;
  settle: SettleResult | null;
  skippedSettle: boolean;
  mode: 'verify-only' | 'verify-and-settle' | 'settle-only';
  message: string;
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

  private getFacilitatorHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      // Evita la página intermedia de ngrok (ERR_NGROK_6024) en clientes HTTP.
      'ngrok-skip-browser-warning': 'true',
    };
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
        headers: this.getFacilitatorHeaders(),
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
        headers: this.getFacilitatorHeaders(),
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

  // ─── Test directo x402 ──────────────────────────────────────────────────────

  /**
   * Construye un pago x402 v2 real usando ExactStellarScheme y lo envía
   * al facilitador OZ con el formato correcto:
   *   POST /verify → { x402Version, paymentPayload, paymentRequirements }
   *
    * @param ownerSecret  - Clave secreta Stellar del pagador (debe tener USDC)
   * @param resource     - Recurso protegido (por defecto: /soroban/register/submit)
   * @param doSettle     - Si es true, liquida el pago on-chain tras verificar
   */
  async testX402Payment(
    ownerSecret: string,
    resource = '/soroban/register/submit',
    doSettle = false,
    verifyFirst = true,
  ): Promise<TestX402PaymentResult> {
    const keypair = Keypair.fromSecret(ownerSecret);
    this.logger.log(`[testX402] Iniciando pago x402 con payerAddress=${keypair.publicKey()}`);

    // ── Requisitos v2 (sin resource/description/mimeType — solo los campos v2) ─
    const reqs: PaymentRequirementsV2 = {
      scheme: 'exact',
      network: 'stellar:testnet',
      amount: '1000000', // 0.10 XLM en stroops (7 decimales: 0.10 × 10^7)
      asset: XLM_SAC_TESTNET,
      payTo: ADMIN_PUBLIC_KEY,
      maxTimeoutSeconds: 300,
      extra: { areFeesSponsored: true },
    };

    const requiredAmount = Number(reqs.amount) / 1e7;
    const xlmBalance = await this.getXlmBalance(keypair.publicKey());
    const preflight: PayerPreflight = {
      requiredAmount: requiredAmount.toFixed(7),
      xlmBalance: xlmBalance.toFixed(7),
      isSufficient: xlmBalance >= requiredAmount,
    };

    if (!preflight.isSufficient) {
      throw new Error(
        `Saldo XLM insuficiente para pago x402. Requerido: ${preflight.requiredAmount} XLM, disponible: ${preflight.xlmBalance} XLM en ${keypair.publicKey()}`,
      );
    }

    // ── Signer compatible con ExactStellarScheme (cliente @x402/stellar) ────
    const signer = {
      address: keypair.publicKey(),
      signAuthEntry: async (authEntryXdr: string) => {
        const signedAuthEntry = keypair
          .sign(hash(Buffer.from(authEntryXdr, 'base64')))
          .toString('base64');
        return { signedAuthEntry, signerAddress: keypair.publicKey() };
      },
    };

    // ── Construir transacción con ExactStellarScheme ─────────────────────────
    this.logger.log('[testX402] Construyendo transacción USDC con ExactStellarScheme...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheme = new ExactStellarScheme(signer as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partial = await (scheme as any).createPaymentPayload(2, reqs) as {
      x402Version: number;
      payload: { transaction: string };
    };

    // ── Construir PaymentPayloadV2 con el campo "accepted" ───────────────────
    const paymentPayloadV2: PaymentPayloadV2 = {
      x402Version: 2,
      accepted: reqs,
      payload: partial.payload,
      resource: { url: resource, mimeType: 'application/json' },
    };

    // ── Cuerpo correcto para el facilitador OZ v2 ────────────────────────────
    const facilitatorBody: FacilitatorV2Request = {
      x402Version: 2,
      paymentPayload: paymentPayloadV2,
      paymentRequirements: reqs,
    };

    // ── Verificar con el facilitador (opcional) ─────────────────────────────
    let verifyResult: VerifyResult | null = null;
    if (verifyFirst) {
      this.logger.log('[testX402] Verificando pago con el facilitador...');
      verifyResult = await this.callFacilitatorV2<VerifyResult>('verify', facilitatorBody);
      this.logger.log(`[testX402] verify → isValid=${verifyResult.isValid} reason=${verifyResult.invalidReason}`);
    }

    // ── Liquidar (solo si se pide y la verificación fue exitosa) ─────────────
    let settleResult: SettleResult | null = null;
    if (doSettle && (!verifyFirst || verifyResult?.isValid)) {
      this.logger.log('[testX402] Liquidando pago on-chain...');
      settleResult = await this.callFacilitatorV2<SettleResult>('settle', facilitatorBody);
      this.logger.log(`[testX402] settle → success=${settleResult.success}, txHash=${settleResult.txHash}`);
    }

    const mode: 'verify-only' | 'verify-and-settle' | 'settle-only' =
      doSettle ? (verifyFirst ? 'verify-and-settle' : 'settle-only') : 'verify-only';

    return {
      payerAddress: keypair.publicKey(),
      paymentRequirements: reqs,
      preflight,
      verify: verifyResult,
      settle: settleResult,
      skippedSettle: !doSettle,
      mode,
      message: doSettle
        ? (settleResult?.success ? 'Pago liquidado on-chain exitosamente' : 'Pago verificado pero falló la liquidación')
        : (verifyResult?.isValid
          ? 'Pago verificado (settle omitido — pasa settle=true para liquidar)'
          : `Pago inválido en verify: ${verifyResult?.invalidReason ?? 'desconocido'}`),
    };
  }

  /** Llama al facilitador OZ con el formato correcto para x402 v2 */
  private async callFacilitatorV2<T>(
    route: 'verify' | 'settle',
    body: FacilitatorV2Request,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/${route}`, {
        method: 'POST',
        headers: this.getFacilitatorHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Facilitador /${route} respondió ${response.status}: ${text}`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Facilitador /${route} respondió ${response.status}: ${text}`);
      }
    } catch (error) {
      throw this.normalizeError(error, route);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async getXlmBalance(address: string): Promise<number> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${address}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json() as {
        balances?: Array<{ asset_type?: string; balance?: string }>;
      };

      const xlm = data.balances?.find((b) => b.asset_type === 'native')?.balance;
      return Number(xlm ?? '0');
    } catch {
      return 0;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}