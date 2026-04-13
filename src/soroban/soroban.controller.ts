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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SorobanService } from './soroban.service';
import { FacilitatorService } from './facilitator.service';
import {
  CONTRACT_ID,
  EXPLORER_TESTNET,
  REGISTRATION_PAYMENT_REQUIREMENTS,
} from './soroban.constants';

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

/**
 * Controlador Soroban — Expone los 4 métodos del contrato Nova Registry
 *
 * Endpoints:
 *  GET    /soroban/info                      — Info del contrato desplegado
 *  GET    /soroban/count                     — get_hash_count (read-only, gratuito)
 *  GET    /soroban/hash/:hash                — get_hash_info (read-only, gratuito)
 *  GET    /soroban/facilitator/supported     — payment kinds del facilitador OZ
 *  POST   /soroban/initialize                — Inicializa el contrato (una sola vez)
 *  POST   /soroban/register/prepare          — Fase 1: obtiene el auth entry para el owner
 *  POST   /soroban/register/submit           — Fase 2: pago x402 (OZ Facilitator) + doble firma
 *  POST   /soroban/register/dev              — Registro en un solo paso (solo para testing)
 */
@Controller('soroban')
export class SorobanController {
  constructor(
    private readonly sorobanService: SorobanService,
    private readonly facilitatorService: FacilitatorService,
  ) {}

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
      facilitator: {
        network: REGISTRATION_PAYMENT_REQUIREMENTS.network,
        asset: REGISTRATION_PAYMENT_REQUIREMENTS.asset,
        maxAmountRequired: REGISTRATION_PAYMENT_REQUIREMENTS.maxAmountRequired,
        payTo: REGISTRATION_PAYMENT_REQUIREMENTS.payTo,
      },
    };
  }

  /**
   * GET /soroban/facilitator/supported
   * Consulta al facilitador de OpenZeppelin qué payment kinds acepta.
   * Útil para el agente IA y para debug.
   */
  @Get('facilitator/supported')
  async getFacilitatorSupported() {
    try {
      return await this.facilitatorService.getSupported();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error conectando al facilitador';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
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
   * FASE 2: Puerta de pago x402 real con OpenZeppelin Facilitator + doble firma Soroban.
   *
   * ── Flujo x402 v2 ──────────────────────────────────────────────────────────
   *  Sin X-PAYMENT header  → 402 con X-PAYMENT-REQUIRED header + body con requisitos
   *  Con X-PAYMENT header  →
   *    1. Decodificar X-PAYMENT (base64 → JSON)
   *    2. POST facilitador /verify  → valida la transacción Stellar del cliente
   *    3. POST facilitador /settle  → liquida el pago on-chain via OpenZeppelin Relayer
   *    4. Submit de la transacción Soroban con doble firma (owner + admin)
   *
   * El header X-PAYMENT contiene un JSON base64 con la transacción Stellar firmada
   * por el owner que transfiere XLM al admin como pago por el servicio.
   */
  @Post('register/submit')
  async submitRegister(
    @Body() body: SubmitRegisterBody,
    @Headers('x-payment') xPayment: string | undefined,
    @Res() res: Response,
  ) {
    if (!body.hash || !body.ownerAddress || !body.ownerSignedAuthEntryXdr) {
      throw new HttpException(
        'hash, ownerAddress y ownerSignedAuthEntryXdr son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ── Puerta x402: sin X-PAYMENT → devolver 402 con requisitos ───────────
    if (!xPayment) {
      const requirements = {
        ...REGISTRATION_PAYMENT_REQUIREMENTS,
        resource: `${body.ownerAddress ? body.ownerAddress : 'unknown'}/soroban/register/submit`,
      };

      const paymentRequiredBody = {
        x402Version: 2,
        accepts: [requirements],
        error: 'Payment Required',
      };

      const encoded = Buffer.from(JSON.stringify(paymentRequiredBody)).toString('base64');

      return res
        .status(HttpStatus.PAYMENT_REQUIRED)
        .set('X-PAYMENT-REQUIRED', encoded)
        .json(paymentRequiredBody);
    }

    // ── Decodificar y validar el X-PAYMENT header ───────────────────────────
    let paymentPayload;
    try {
      paymentPayload = this.facilitatorService.decodeXPaymentHeader(xPayment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'X-PAYMENT header inválido';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }

    const requirements = { ...REGISTRATION_PAYMENT_REQUIREMENTS };

    // ── PASO 1: Verificar pago con el facilitador OpenZeppelin ──────────────
    let verifyResult;
    try {
      verifyResult = await this.facilitatorService.verify(paymentPayload, requirements);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al verificar el pago con el facilitador';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }

    if (!verifyResult.isValid) {
      throw new HttpException(
        {
          error: 'payment_verification_failed',
          message: 'El facilitador rechazó el pago',
          reason: verifyResult.invalidReason,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // ── PASO 2: Liquidar el pago on-chain ───────────────────────────────────
    let settleResult;
    try {
      settleResult = await this.facilitatorService.settle(paymentPayload, requirements);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al liquidar el pago on-chain';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }

    if (!settleResult.success) {
      throw new HttpException(
        {
          error: 'payment_settlement_failed',
          message: 'El facilitador no pudo liquidar el pago',
          txHash: settleResult.txHash,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // ── PASO 3: Registrar el hash en el contrato Soroban ────────────────────
    try {
      const result = await this.sorobanService.submitRegisterHash(
        body.hash,
        body.ownerAddress,
        body.ownerSignedAuthEntryXdr,
      );

      return res.status(HttpStatus.OK).json({
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        payment: {
          settled: true,
          paymentTxHash: settleResult.txHash,
          networkId: settleResult.networkId,
        },
        certificate: {
          hash: body.hash,
          owner: result.registrationInfo.owner,
          timestamp: result.registrationInfo.timestamp,
          registeredAt: new Date(result.registrationInfo.timestamp * 1000).toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Error enviando la transacción Soroban';
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
