import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  rpc,
  TransactionBuilder,
  xdr,
  scValToNative,
  authorizeEntry,
} from '@stellar/stellar-sdk';
import {
  AUTH_ENTRY_LEDGER_OFFSET,
  CONTRACT_ID,
  SOROBAN_RPC_MAINNET,
  SOROBAN_RPC_TESTNET,
} from './soroban.constants';

export interface RegistrationInfo {
  owner: string;
  timestamp: number;
}

export interface PrepareResult {
  /** XDR de la transacción base (para referencia del cliente) */
  ownerAuthEntryXdr: string;
  /** Ledger a partir del cual el auth entry es válido */
  latestLedger: number;
  /** Ledger de expiración recomendado para el auth entry */
  expirationLedger: number;
}

export interface SubmitResult {
  txHash: string;
  registrationInfo: RegistrationInfo;
  explorerUrl: string;
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly server: rpc.Server;
  private readonly adminKeypair: Keypair;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly network: string;

  constructor(private readonly config: ConfigService) {
    this.network = config.get<string>('STELLAR_NETWORK') ?? 'testnet';
    const rpcUrl =
      this.network === 'mainnet' ? SOROBAN_RPC_MAINNET : SOROBAN_RPC_TESTNET;

    this.networkPassphrase =
      this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    this.server = new rpc.Server(rpcUrl, { allowHttp: false });
    this.adminKeypair = Keypair.fromSecret(
      config.getOrThrow<string>('STELLAR_SECRET'),
    );
    this.contract = new Contract(CONTRACT_ID);
  }

  // ─── Funciones de escritura ───────────────────────────────────────────────

  /**
   * Llama a `initialize(admin)` en el contrato.
   * Solo puede ejecutarse una vez. Firma como admin (source account).
   */
  async initialize(adminAddress: string): Promise<{ txHash: string }> {
    const account = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call('initialize', new Address(adminAddress).toScVal()),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(this.adminKeypair);

    const result = await this.server.sendTransaction(prepared);
    this.logger.log(`initialize tx enviada: ${result.hash}`);

    return { txHash: result.hash };
  }

  /**
   * FASE 1 — Construye la transacción y simula para obtener el auth entry
   * que el OWNER debe firmar con su keypair.
   *
   * El owner recibe `ownerAuthEntryXdr` y lo firma usando:
   *   `authorizeEntry(entry, ownerKeypair, expirationLedger, networkPassphrase)`
   */
  async prepareRegisterHash(
    hash: string,
    ownerAddress: string,
  ): Promise<PrepareResult> {
    const hashBytes = this.hexToScvBytes(hash);
    const ownerScVal = new Address(ownerAddress).toScVal();

    const account = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call('register_hash', hashBytes, ownerScVal),
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulación fallida: ${simResult.error}`);
    }

    const successResult =
      simResult as rpc.Api.SimulateTransactionSuccessResponse;
    const authEntries = successResult.result?.auth ?? [];

    // Buscar el auth entry que corresponde al OWNER (no al admin)
    const ownerEntry = authEntries.find((e) => {
      if (
        e.credentials().switch() !==
        xdr.SorobanCredentialsType.sorobanCredentialsAddress()
      ) {
        return false;
      }
      const entryAddress = Address.fromScAddress(
        e.credentials().address().address(),
      ).toString();
      return entryAddress === ownerAddress;
    });

    if (!ownerEntry) {
      throw new Error(
        'No se encontró auth entry para el owner en la simulación',
      );
    }

    const latestLedger = successResult.latestLedger;
    const expirationLedger = latestLedger + AUTH_ENTRY_LEDGER_OFFSET;

    return {
      ownerAuthEntryXdr: ownerEntry.toXDR('base64'),
      latestLedger,
      expirationLedger,
    };
  }

  /**
   * FASE 2 — El owner ya firmó su auth entry. El backend:
   *  1. Reconstruye la transacción
   *  2. Simula para obtener recursos y el auth set actualizado
   *  3. Reemplaza el auth entry del owner con el firmado
   *  4. Firma como admin (source account) y envía
   */
  async submitRegisterHash(
    hash: string,
    ownerAddress: string,
    ownerSignedAuthEntryXdr: string,
  ): Promise<SubmitResult> {
    const hashBytes = this.hexToScvBytes(hash);
    const ownerScVal = new Address(ownerAddress).toScVal();
    const ownerSignedEntry = xdr.SorobanAuthorizationEntry.fromXDR(
      ownerSignedAuthEntryXdr,
      'base64',
    );

    const account = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call('register_hash', hashBytes, ownerScVal),
      )
      .setTimeout(300)
      .build();

    // Simular para obtener recursos de red y el auth set
    const simResult = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulación fallida: ${simResult.error}`);
    }

    // Ensamblar con soroban data (fees, footprint, resources)
    const assembled = rpc.assembleTransaction(tx, simResult).build();
    const envelope = assembled.toEnvelope();

    // Reemplazar el auth entry del owner con el firmado por el cliente
    const ops = envelope.v1().tx().operations();
    const invokeOp = ops[0].body().invokeHostFunctionOp();
    const currentAuth = invokeOp.auth();

    const newAuth = currentAuth.map((entry) => {
      if (
        entry.credentials().switch() ===
        xdr.SorobanCredentialsType.sorobanCredentialsAddress()
      ) {
        const entryAddr = Address.fromScAddress(
          entry.credentials().address().address(),
        ).toString();
        if (entryAddr === ownerAddress) {
          return ownerSignedEntry;
        }
      }
      return entry;
    });

    invokeOp.auth(newAuth);

    // Reconstruir la transacción desde el envelope modificado y firmar como admin
    const modifiedTx = TransactionBuilder.fromXDR(
      envelope.toXDR('base64'),
      this.networkPassphrase,
    );
    modifiedTx.sign(this.adminKeypair);

    const sendResult = await this.server.sendTransaction(modifiedTx);
    this.logger.log(`register_hash tx enviada: ${sendResult.hash}`);

    // Esperar confirmación
    const confirmed = await this.pollTransactionResult(sendResult.hash);

    const successTx =
      confirmed as rpc.Api.GetSuccessfulTransactionResponse;
    const native = scValToNative(successTx.returnValue!);

    const explorerBase =
      this.network === 'mainnet'
        ? 'https://stellar.expert/explorer/mainnet/tx/'
        : 'https://stellar.expert/explorer/testnet/tx/';

    return {
      txHash: sendResult.hash,
      registrationInfo: {
        owner: native.owner.toString(),
        timestamp: Number(native.timestamp),
      },
      explorerUrl: explorerBase + sendResult.hash,
    };
  }

  // ─── Funciones de solo lectura ────────────────────────────────────────────

  /**
   * Llama a `get_hash_info(hash)` vía simulación (gratuita, sin auth).
   */
  async getHashInfo(hash: string): Promise<RegistrationInfo> {
    const hashBytes = this.hexToScvBytes(hash);
    const account = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call('get_hash_info', hashBytes))
      .setTimeout(30)
      .build();

    const simResult = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      const errMsg = (simResult as rpc.Api.SimulateTransactionErrorResponse).error;
      if (errMsg.includes('HashNotFound') || errMsg.includes('Error(Contract, #2)')) {
        throw new NotFoundException(`Hash no registrado: ${hash}`);
      }
      throw new Error(`Simulación fallida: ${errMsg}`);
    }

    const successResult =
      simResult as rpc.Api.SimulateTransactionSuccessResponse;
    const retval = successResult.result?.retval;
    if (!retval) throw new Error('Sin valor de retorno en la simulación');

    const native = scValToNative(retval);
    return {
      owner: native.owner.toString(),
      timestamp: Number(native.timestamp),
    };
  }

  /**
   * Llama a `get_hash_count()` vía simulación (gratuita, sin auth).
   */
  async getHashCount(): Promise<number> {
    const account = await this.server.getAccount(
      this.adminKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call('get_hash_count'))
      .setTimeout(30)
      .build();

    const simResult = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(
        `Simulación fallida: ${(simResult as rpc.Api.SimulateTransactionErrorResponse).error}`,
      );
    }

    const successResult =
      simResult as rpc.Api.SimulateTransactionSuccessResponse;
    const retval = successResult.result?.retval;
    if (!retval) return 0;

    return Number(scValToNative(retval));
  }

  // ─── Utilidades privadas ──────────────────────────────────────────────────

  /** Convierte un hash hex (con o sin 0x) a ScVal bytes */
  private hexToScvBytes(hash: string): xdr.ScVal {
    const clean = hash.replace(/^0x/, '');
    if (clean.length !== 64) {
      throw new Error(
        `Hash inválido: debe ser 32 bytes (64 caracteres hex), recibido: ${clean.length} caracteres`,
      );
    }
    return xdr.ScVal.scvBytes(Buffer.from(clean, 'hex'));
  }

  /** Hace polling hasta que la transacción sea confirmada o falle */
  private async pollTransactionResult(
    txHash: string,
    maxAttempts = 15,
    intervalMs = 2000,
  ): Promise<rpc.Api.GetTransactionResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.server.getTransaction(txHash);

      if (
        response.status !== rpc.Api.GetTransactionStatus.NOT_FOUND
      ) {
        if (
          response.status === rpc.Api.GetTransactionStatus.FAILED
        ) {
          throw new Error(
            `Transacción fallida en la blockchain: ${txHash}`,
          );
        }
        return response;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Transacción no confirmada después de ${maxAttempts} intentos: ${txHash}`,
    );
  }

  /**
   * Firma un auth entry del owner — útil para testing cuando el backend
   * controla también el keypair del owner (NO usar en producción).
   * @internal
   */
  async signAuthEntryWithSecret(
    authEntryXdr: string,
    ownerSecret: string,
    expirationLedger: number,
  ): Promise<string> {
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');
    const ownerKeypair = Keypair.fromSecret(ownerSecret);
    const signed = await authorizeEntry(
      entry,
      ownerKeypair,
      expirationLedger,
      this.networkPassphrase,
    );
    return signed.toXDR('base64');
  }
}
