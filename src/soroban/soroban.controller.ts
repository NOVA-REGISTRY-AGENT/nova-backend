import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Headers,
} from '@nestjs/common';
import { SorobanService } from './soroban.service';
import { CONTRACT_ID, EXPLORER_TESTNET } from './soroban.constants';

// ─── Interfaces de Request/Response ─────────────────────────────────────────

interface InitializeBody {
  /** Dirección Stellar del admin (por defecto usa el admin del contrato desplegado) */
  adminAddress: string;
}

interface PrepareRegisterBody {
  /** Hash SHA-256 del archivo musical en formato hex (con o sin 0x) */
  hash: string;
  /** Dirección pública Stellar del propietario */
  ownerAddress: string;
}

interface SubmitRegisterBody {
  /** Hash SHA-256 del archivo musical en formato hex */
  hash: string;
  /** Dirección pública Stellar del propietario */
  ownerAddress: string;
  /** XDR en base64 del SorobanAuthorizationEntry firmado por el owner */
  ownerSignedAuthEntryXdr: string;
}

interface DevRegisterBody {
  /** Hash SHA-256 del archivo musical en formato hex */
  hash: string;
  /** Dirección pública Stellar del propietario */
  ownerAddress: string;
  /** Clave secreta del owner — SOLO PARA TESTING/DEMO */
  ownerSecret: string;
}

// ─── Constante interna de pago x402 ──────────────────────────────────────────

const PAYMENT_AMOUNT = '1';
const PAYMENT_ASSET = 'XLM';

/**
 * Controlador Soroban — Expone los 4 métodos del contrato Nova Registry
 *
 * Endpoints:
 *  POST   /soroban/initialize                — Inicializa el contrato (una sola vez)
 *  POST   /soroban/register/prepare          — Fase 1: obtiene el auth entry para el owner
 *  POST   /soroban/register/submit           — Fase 2: submite con auth del owner firmado (x402)
 *  POST   /soroban/register/dev              — Registro en un solo paso (solo para testing)
 *  GET    /soroban/hash/:hash                — get_hash_info (read-only, gratuito)
 *  GET    /soroban/count                     — get_hash_count (read-only, gratuito)
 *  GET    /soroban/info                      — Info del contrato desplegado
 */
@Controller('soroban')
export class SorobanController {
  constructor(private readonly sorobanService: SorobanService) {}

  /**
   * GET /soroban/info
   * Devuelve los datos estáticos del contrato (Contract ID, red, explorador).
   */
  @Get('info')
  getContractInfo() {
    return {
      contractId: CONTRACT_ID,
      network: 'testnet',
      explorerUrl: EXPLORER_TESTNET,
      functions: ['initialize', 'register_hash', 'get_hash_info', 'get_hash_count'],
    };
  }

  /**
   * POST /soroban/initialize
   * Llama a `initialize(admin)` en el contrato Soroban.
   * Solo puede ejecutarse una vez. El backend firma como admin.
   */
  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  async initialize(@Body() body: InitializeBody) {
    if (!body.adminAddress) {
      throw new HttpException(
        'adminAddress es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.sorobanService.initialize(body.adminAddress);
      return {
        success: true,
        txHash: result.txHash,
        message: 'Contrato inicializado exitosamente',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al inicializar el contrato';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /soroban/register/prepare
   *
   * FASE 1 del flujo de doble firma.
   * Simula la transacción `register_hash` y devuelve el auth entry XDR
   * que el OWNER debe firmar con su keypair Stellar antes de proceder.
   *
   * El cliente/agente debe:
   *   1. Recibir `ownerAuthEntryXdr` y `expirationLedger`
   *   2. Firmar con: `authorizeEntry(entry, ownerKeypair, expirationLedger, networkPassphrase)`
   *   3. Llamar a POST /soroban/register/submit con el XDR firmado
   */
  @Post('register/prepare')
  @HttpCode(HttpStatus.OK)
  async prepareRegister(@Body() body: PrepareRegisterBody) {
    if (!body.hash || !body.ownerAddress) {
      throw new HttpException(
        'hash y ownerAddress son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.sorobanService.prepareRegisterHash(
        body.hash,
        body.ownerAddress,
      );
      return {
        ownerAuthEntryXdr: result.ownerAuthEntryXdr,
        latestLedger: result.latestLedger,
        expirationLedger: result.expirationLedger,
        instructions:
          'Firma ownerAuthEntryXdr con tu keypair Stellar y envíalo a POST /soroban/register/submit',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error preparando la transacción';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * POST /soroban/register/submit
   *
   * FASE 2: Puerta de pago x402 + Submit con doble firma.
   *
   * Flujo x402:
   *  - Sin headers de pago → devuelve 402 con instrucciones
   *  - Con `payment-signature` header válido → procede al registro on-chain
   *
   * El backend firma como admin (source account), el owner ya firmó su auth entry.
   */
  @Post('register/submit')
  @HttpCode(HttpStatus.OK)
  async submitRegister(
    @Body() body: SubmitRegisterBody,
    @Headers('payment-signature') paymentSignature: string | undefined,
    @Headers('x-stellar-public-key') stellarPublicKey: string | undefined,
    @Headers('x-payment-nonce') paymentNonce: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!body.hash || !body.ownerAddress || !body.ownerSignedAuthEntryXdr) {
      throw new HttpException(
        'hash, ownerAddress y ownerSignedAuthEntryXdr son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ── Puerta de pago x402 ────────────────────────────────────────────────
    if (!paymentSignature || !stellarPublicKey || !paymentNonce) {
      throw new HttpException(
        {
          error: 'payment_required',
          message:
            'Se requiere un micropago x402 para registrar un hash en el contrato Soroban',
          payment: {
            amount: PAYMENT_AMOUNT,
            asset: PAYMENT_ASSET,
            network: 'testnet',
            resource: '/soroban/register/submit',
            requiredHeaders: [
              'payment-signature',
              'x-stellar-public-key',
              'x-payment-nonce',
              'x-idempotency-key',
            ],
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // ── Validación básica de coherencia del pago ───────────────────────────
    if (stellarPublicKey !== body.ownerAddress) {
      throw new HttpException(
        'La clave pública del pago no coincide con ownerAddress',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const result = await this.sorobanService.submitRegisterHash(
        body.hash,
        body.ownerAddress,
        body.ownerSignedAuthEntryXdr,
      );

      return {
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        certificate: {
          hash: body.hash,
          owner: result.registrationInfo.owner,
          timestamp: result.registrationInfo.timestamp,
          registeredAt: new Date(result.registrationInfo.timestamp * 1000).toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Error enviando la transacción';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * POST /soroban/register/dev
   *
   * Registro en un solo paso para TESTING/DEMO.
   * Acepta el ownerSecret directamente — NO usar en producción.
   *
   * Internamente: prepare → firma el auth entry → submit.
   */
  @Post('register/dev')
  @HttpCode(HttpStatus.OK)
  async devRegister(@Body() body: DevRegisterBody) {
    if (!body.hash || !body.ownerAddress || !body.ownerSecret) {
      throw new HttpException(
        'hash, ownerAddress y ownerSecret son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Fase 1: obtener el auth entry
      const prepResult = await this.sorobanService.prepareRegisterHash(
        body.hash,
        body.ownerAddress,
      );

      // Firmar el auth entry con el secret del owner (solo en demo)
      const signedAuthEntryXdr =
        await this.sorobanService.signAuthEntryWithSecret(
          prepResult.ownerAuthEntryXdr,
          body.ownerSecret,
          prepResult.expirationLedger,
        );

      // Fase 2: submit con la firma
      const result = await this.sorobanService.submitRegisterHash(
        body.hash,
        body.ownerAddress,
        signedAuthEntryXdr,
      );

      return {
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        certificate: {
          hash: body.hash,
          owner: result.registrationInfo.owner,
          timestamp: result.registrationInfo.timestamp,
          registeredAt: new Date(
            result.registrationInfo.timestamp * 1000,
          ).toISOString(),
        },
        _warning: 'Endpoint solo para uso en desarrollo/testing',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error en registro de desarrollo';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * GET /soroban/hash/:hash
   *
   * Llama a `get_hash_info(hash)` via simulación (gratuita, sin auth requerido).
   * Devuelve el propietario y timestamp del registro.
   */
  @Get('hash/:hash')
  async getHashInfo(@Param('hash') hash: string) {
    try {
      const info = await this.sorobanService.getHashInfo(hash);
      return {
        hash,
        owner: info.owner,
        timestamp: info.timestamp,
        registeredAt: new Date(info.timestamp * 1000).toISOString(),
        contractId: CONTRACT_ID,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Error consultando el hash';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * GET /soroban/count
   *
   * Llama a `get_hash_count()` via simulación (gratuita, sin auth requerido).
   * Devuelve el total de obras registradas en el contrato.
   */
  @Get('count')
  async getHashCount() {
    try {
      const count = await this.sorobanService.getHashCount();
      return {
        totalRegistered: count,
        contractId: CONTRACT_ID,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error consultando el contador';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }
}
