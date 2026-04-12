import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CertificateResponse,
  NovaRegistryError,
  NovaRegistrySDK,
  RegisterAcceptedResponse,
  RegisterAssetInput,
  RegisterStatusResponse,
} from '@nova-registry/sdk-ts';
import { NOVA_REGISTRY_SDK } from './nova-registry.constants';

@Injectable()
export class NovaRegistryService {
  private readonly logger = new Logger(NovaRegistryService.name);

  constructor(
    @Inject(NOVA_REGISTRY_SDK)
    private readonly sdk: NovaRegistrySDK,
  ) {}

  /** Registra un asset en Nova Registry (maneja el flujo x402 automáticamente) */
  async registerAsset(
    input: RegisterAssetInput,
  ): Promise<RegisterAcceptedResponse> {
    try {
      return await this.sdk.registerAsset(input);
    } catch (error) {
      return this.handleSdkError(error, 'registerAsset');
    }
  }

  /** Consulta el estado de un registro por su requestId */
  async getStatus(requestId: string): Promise<RegisterStatusResponse> {
    try {
      return await this.sdk.getRegistrationStatus(requestId);
    } catch (error) {
      return this.handleSdkError(error, 'getStatus');
    }
  }

  /** Obtiene el certificado por su ID */
  async getCertificate(certificateId: string): Promise<CertificateResponse> {
    try {
      return await this.sdk.getCertificate(certificateId);
    } catch (error) {
      return this.handleSdkError(error, 'getCertificate');
    }
  }

  /** Verifica si ya existe un certificado para un hash de contenido */
  async checkByHash(
    contentHash: string,
  ): Promise<{ exists: boolean; certificateId?: string; txHash?: string }> {
    try {
      return await this.sdk.getCertificateByHash(contentHash);
    } catch (error) {
      return this.handleSdkError(error, 'checkByHash');
    }
  }

  private handleSdkError(error: unknown, method: string): never {
    if (error instanceof NovaRegistryError) {
      this.logger.error(
        `[${method}] Nova Registry error ${error.status}: ${error.message}`,
        error.details,
      );
    } else {
      this.logger.error(`[${method}] Unexpected error`, error);
    }
    throw error;
  }
}
