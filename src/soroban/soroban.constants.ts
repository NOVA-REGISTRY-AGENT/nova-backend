/** ID del contrato Nova Registry desplegado en Testnet */
export const CONTRACT_ID =
  'CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD';

/** Dirección pública del admin (Backend API) — recibe los pagos x402 */
export const ADMIN_PUBLIC_KEY =
  'GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4';

/** URL del RPC de Soroban para Testnet */
export const SOROBAN_RPC_TESTNET = 'https://soroban-testnet.stellar.org';

/** URL del RPC de Soroban para Mainnet */
export const SOROBAN_RPC_MAINNET = 'https://mainnet.sorobanrpc.com';

/** Explorer base URL */
export const EXPLORER_TESTNET =
  'https://stellar.expert/explorer/testnet/contract/' + CONTRACT_ID;

/** Ledger extra para expiración de auth entries */
export const AUTH_ENTRY_LEDGER_OFFSET = 100;

// ─── Configuración del Facilitador OpenZeppelin x402 ─────────────────────────

/**
 * URL base del facilitador x402 de OpenZeppelin Relayer.
 * Las rutas son: /verify  /settle  /supported
 * Se puede sobreescribir con la variable de entorno FACILITATOR_URL.
 */
export const FACILITATOR_URL_DEFAULT =
  'https://dot-revealable-telescopically.ngrok-free.dev/api/v1/plugins/x402/call';

/** Contrato SAC de USDC en Stellar Testnet */
export const USDC_SAC_TESTNET =
  'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

/** Issuer de USDC en Stellar Testnet (asset clásico en Horizon) */
export const USDC_ISSUER_TESTNET =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

/**
 * Contrato SAC de XLM nativo en Stellar Testnet.
 * Derivado de: Asset.native().contractId(Networks.TESTNET)
 */
export const XLM_SAC_TESTNET =
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

/**
 * Precio de registro expresado en notación dólar.
 * @x402/express lo convierte internamente a unidades atómicas USDC.
 */
export const REGISTRATION_PRICE = '$0.10';

/**
 * Información de pago x402 v2 para display (GET /soroban/info).
 * La configuración real del middleware está en main.ts.
 */
export const REGISTRATION_PAYMENT_INFO = {
  scheme: 'exact',
  network: 'stellar:testnet',
  price: REGISTRATION_PRICE,
  asset: USDC_SAC_TESTNET,
  payTo: ADMIN_PUBLIC_KEY,
  description: 'Nova Registry — Registro de hash musical en Stellar blockchain',
} as const;
