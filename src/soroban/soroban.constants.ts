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

/**
 * Requisitos de pago x402 que el backend publica en la respuesta 402.
 * El cliente (Agente IA / SDK) usa estos datos para construir la transacción Stellar.
 */
export const REGISTRATION_PAYMENT_REQUIREMENTS = {
  scheme: 'exact',
  network: 'stellar:testnet',
  /** 0.5 XLM expresado en stroops (1 XLM = 10_000_000 stroops) */
  maxAmountRequired: '5000000',
  resource: '/soroban/register/submit',
  description: 'Nova Registry — Registro de hash musical en Stellar blockchain',
  mimeType: 'application/json',
  /** Dirección del backend que recibe el pago */
  payTo: ADMIN_PUBLIC_KEY,
  maxTimeoutSeconds: 300,
  /** "native" = XLM nativo de Stellar */
  asset: 'native',
  extra: { areFeesSponsored: true },
} as const;
