import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { NovaRegistryError } from '@nova-registry/sdk-ts';
import { NovaRegistryService } from '../nova-registry/nova-registry.service';

interface RegisterAssetBody {
  contentHash: string;
  title?: string;
  artist?: string;
  fileName?: string;
  ownerAddress?: string;
  metadata?: Record<string, unknown>;
}

@Controller('assets')
export class AssetsController {
  constructor(private readonly novaRegistry: NovaRegistryService) {}

  /**
   * POST /assets/register
   * Registra un nuevo asset digital en Nova Registry.
   * Ejecuta el flujo x402 de pago automáticamente si el backend lo requiere.
   */
  @Post('register')
  async register(@Body() body: RegisterAssetBody) {
    try {
      return await this.novaRegistry.registerAsset(body);
    } catch (error) {
      if (error instanceof NovaRegistryError) {
        throw new HttpException(error.message, error.status);
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /assets/status/:requestId
   * Consulta el estado de un registro usando el requestId recibido al registrar.
   */
  @Get('status/:requestId')
  async status(@Param('requestId') requestId: string) {
    try {
      return await this.novaRegistry.getStatus(requestId);
    } catch (error) {
      if (error instanceof NovaRegistryError) {
        throw new HttpException(error.message, error.status);
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /assets/certificate/:certificateId
   * Obtiene el certificado final de registro por su ID.
   */
  @Get('certificate/:certificateId')
  async certificate(@Param('certificateId') certificateId: string) {
    try {
      return await this.novaRegistry.getCertificate(certificateId);
    } catch (error) {
      if (error instanceof NovaRegistryError) {
        throw new HttpException(error.message, error.status);
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /assets/check/:contentHash
   * Verifica si un hash de contenido ya tiene un certificado registrado.
   */
  @Get('check/:contentHash')
  async checkByHash(@Param('contentHash') contentHash: string) {
    try {
      return await this.novaRegistry.checkByHash(contentHash);
    } catch (error) {
      if (error instanceof NovaRegistryError) {
        throw new HttpException(error.message, error.status);
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
