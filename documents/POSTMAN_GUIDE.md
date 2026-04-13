# Nova Registry Backend — Guía de endpoints en Postman

Base URL: `http://localhost:3000`

---

## Variables de entorno requeridas (`.env`)

Antes de levantar el servidor, crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
STELLAR_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NOVA_REGISTRY_URL=https://api.nova-registry.io
STELLAR_NETWORK=testnet
PORT=3000
```

> **Importante:** Nunca expongas `STELLAR_SECRET` en logs ni en respuestas HTTP.

---

## Configuración en Postman

### 1. Crear un Environment

1. Abre Postman → pestaña **Environments** → **Add**.
2. Nombra el entorno `Nova Registry Local`.
3. Agrega la variable:

| Variable   | Initial Value           | Current Value           |
|------------|-------------------------|-------------------------|
| `base_url` | `http://localhost:3000` | `http://localhost:3000` |

4. Guarda y selecciona el entorno activo.

---

## Endpoints disponibles

### 1. Registrar un asset

**Método:** `POST`  
**URL:** `{{base_url}}/assets/register`  
**Headers:**

| Key          | Value            |
|--------------|------------------|
| Content-Type | application/json |

**Body (raw JSON):**

```json
{
  "contentHash": "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
  "title": "Mi Canción IA",
  "artist": "Nova Agent",
  "fileName": "cancion-ia.wav",
  "ownerAddress": "GABCDE...STELLAR_PUBLIC_KEY",
  "metadata": {
    "genre": "synthwave",
    "aiModel": "Claude 3.5 Sonnet",
    "year": 2026
  }
}
```

> `ownerAddress` es **opcional**. Si no se envía, usa la dirección pública derivada de `STELLAR_SECRET`.  
> `contentHash` es **obligatorio** y debe tener el formato `sha256:<hex>`.

**Respuesta exitosa `200`:**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "paymentStatus": "pending",
  "message": "Registration queued successfully"
}
```

**Respuesta de error `402`** (si el backend exige pago y el flujo falla):

```json
{
  "error": "NovaRegistryError",
  "message": "Payment required",
  "details": null
}
```

---

### 2. Consultar estado de un registro

**Método:** `GET`  
**URL:** `{{base_url}}/assets/status/:requestId`

Reemplaza `:requestId` con el `requestId` obtenido al registrar.

**Ejemplo de URL:**
```
{{base_url}}/assets/status/550e8400-e29b-41d4-a716-446655440000
```

**Respuesta exitosa `200`:**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "paymentStatus": "confirmed",
  "certificateId": "cert-789xyz",
  "txHash": "aabbcc112233...",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/aabbcc112233",
  "createdAt": "2026-04-11T10:30:00.000Z"
}
```

**Posibles valores de `status`:**

| Valor        | Descripción                              |
|--------------|------------------------------------------|
| `queued`     | Solicitud encolada, esperando procesamiento |
| `processing` | En proceso de registro on-chain          |
| `confirmed`  | Registro confirmado en la blockchain     |
| `failed`     | El registro falló                        |

---

### 3. Obtener certificado por ID

**Método:** `GET`  
**URL:** `{{base_url}}/assets/certificate/:certificateId`

Reemplaza `:certificateId` con el `certificateId` del estado confirmado.

**Ejemplo de URL:**
```
{{base_url}}/assets/certificate/cert-789xyz
```

**Respuesta exitosa `200`:**

```json
{
  "certificateId": "cert-789xyz",
  "title": "Mi Canción IA",
  "artist": "Nova Agent",
  "contentHash": "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
  "ownerAddress": "GABCDE...STELLAR_PUBLIC_KEY",
  "network": "testnet",
  "contractId": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "txHash": "aabbcc112233...",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/aabbcc112233",
  "registeredAt": "2026-04-11T10:35:00.000Z",
  "metadata": {
    "genre": "synthwave",
    "aiModel": "Claude 3.5 Sonnet",
    "year": 2026
  }
}
```

---

### 4. Verificar si un hash ya tiene certificado

**Método:** `GET`  
**URL:** `{{base_url}}/assets/check/:contentHash`

Reemplaza `:contentHash` con el hash del contenido (con o sin el prefijo `sha256:`).

**Ejemplo de URL:**
```
{{base_url}}/assets/check/sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd
```

> **Nota:** Si el hash contiene `:`, en Postman usa la URL directamente sin codificar en el campo de URL, ya que Postman lo maneja correctamente.

**Respuesta — asset ya registrado `200`:**

```json
{
  "exists": true,
  "certificateId": "cert-789xyz",
  "txHash": "aabbcc112233..."
}
```

**Respuesta — asset no registrado `200`:**

```json
{
  "exists": false
}
```

---

## Flujo completo recomendado en Postman

```
1. POST /assets/register        → obtén requestId
          ↓
2. GET  /assets/status/{requestId}   → polling hasta status = "confirmed"
          ↓
3. GET  /assets/certificate/{certificateId}  → certificado final con txHash
```

También puedes verificar antes de registrar:

```
0. GET  /assets/check/{contentHash}  → si exists=true, evitas duplicar el registro
```

---

## Códigos de error comunes

| Código HTTP | Causa                                              |
|-------------|----------------------------------------------------|
| `400`       | Body inválido o falta `contentHash`                |
| `402`       | El flujo de pago x402 falló (firma o challenge)    |
| `404`       | `requestId` o `certificateId` no encontrado        |
| `502`       | Error de comunicación con Nova Registry API        |
| `500`       | Error interno del servidor                         |

---

## Colección Postman (importar desde JSON)

Puedes importar esta colección directamente en Postman:

1. Abre Postman → **Import** → **Raw Text**.
2. Pega el siguiente JSON:

```json
{
  "info": {
    "name": "Nova Registry Backend",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Registrar Asset",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"contentHash\": \"sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd\",\n  \"title\": \"Mi Canción IA\",\n  \"artist\": \"Nova Agent\",\n  \"fileName\": \"cancion-ia.wav\",\n  \"metadata\": { \"genre\": \"synthwave\", \"year\": 2026 }\n}"
        },
        "url": { "raw": "{{base_url}}/assets/register", "host": ["{{base_url}}"], "path": ["assets", "register"] }
      }
    },
    {
      "name": "Consultar Estado",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/assets/status/REEMPLAZA_CON_REQUEST_ID", "host": ["{{base_url}}"], "path": ["assets", "status", "REEMPLAZA_CON_REQUEST_ID"] }
      }
    },
    {
      "name": "Obtener Certificado",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/assets/certificate/REEMPLAZA_CON_CERTIFICATE_ID", "host": ["{{base_url}}"], "path": ["assets", "certificate", "REEMPLAZA_CON_CERTIFICATE_ID"] }
      }
    },
    {
      "name": "Verificar Hash",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/assets/check/sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd", "host": ["{{base_url}}"], "path": ["assets", "check", "sha256:abc123..."] }
      }
    }
  ]
}
```

3. Configura el environment `Nova Registry Local` con `base_url = http://localhost:3000`.
4. Ejecuta las requests en el orden del flujo recomendado.

---

---

# Endpoints Soroban — Contrato Nova Registry (Interacción Directa On-Chain)

Estos endpoints interactúan **directamente** con el Smart Contract desplegado en Stellar Testnet usando el **Facilitador x402 de OpenZeppelin Relayer** para validar y liquidar pagos on-chain antes de autorizar el registro.

**Contract ID:** `CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD`  
**Network:** Stellar Testnet  
**Facilitador OZ:** `https://dot-revealable-telescopically.ngrok-free.dev/api/v1/plugins/x402/call`  
**Explorer:** https://stellar.expert/explorer/testnet/contract/CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD

---

## Variables de entorno requeridas (agregar al `.env`)

```env
STELLAR_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_NETWORK=testnet
FACILITATOR_URL=https://dot-revealable-telescopically.ngrok-free.dev/api/v1/plugins/x402/call
FACILITATOR_API_KEY=e860a717-453a-4e87-b1b3-def4a5373118
```

---

## Variables de entorno de Soroban (agregar al Environment de Postman)

| Variable          | Valor de ejemplo                                                   |
|-------------------|--------------------------------------------------------------------|
| `base_url`        | `http://localhost:3000`                                            |
| `owner_address`   | `GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4`       |
| `owner_secret`    | `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (solo dev) |
| `sample_hash`     | `0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20` |

---

## Endpoint 1 — Información del Contrato

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/info`

### Respuesta `200`:
```json
{
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD",
  "network": "testnet",
  "explorerUrl": "https://stellar.expert/explorer/testnet/contract/...",
  "functions": ["initialize", "register_hash", "get_hash_info", "get_hash_count"],
  "facilitator": {
    "network": "stellar:testnet",
    "asset": "native",
    "maxAmountRequired": "5000000",
    "payTo": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4"
  }
}
```

---

## Endpoint 2 — Tipos de pago soportados por el Facilitador OZ

Consulta directamente al Facilitador de OpenZeppelin qué payment kinds acepta. Útil para verificar que el facilitador está activo antes de iniciar un registro.

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/facilitator/supported`

### Respuesta `200`:
```json
{
  "kinds": [
    {
      "extra": { "areFeesSponsored": true },
      "network": "stellar:testnet",
      "scheme": "exact",
      "x402Version": 2
    }
  ],
  "signers": {
    "stellar:testnet": ["GB7VH5ENXQ2SQUMH2IUXOFAF2RG7QGLR6MHQEFPH4NHPUXJ7HIXOCZ6J"]
  }
}
```

> Si este endpoint falla con `502`, el facilitador no está disponible. Verifica `FACILITATOR_URL` y `FACILITATOR_API_KEY` en el `.env`.

---

## Endpoint 3 — Consultar Hash (Read-Only, Gratuito)

Llama a `get_hash_info(hash)` en el contrato. No requiere pago.

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/hash/{{sample_hash}}`

### Respuesta `200`:
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "timestamp": 1744329600,
  "registeredAt": "2026-04-10T12:00:00.000Z",
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD"
}
```

### Respuesta `404` (no registrado):
```json
{
  "statusCode": 404,
  "message": "Hash no registrado: 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
}
```

---

## Endpoint 4 — Contar Registros (Read-Only, Gratuito)

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/count`

### Respuesta `200`:
```json
{
  "totalRegistered": 42,
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD"
}
```

---

## Endpoint 5 — Inicializar el Contrato

> ⚠️ Solo ejecutar **una vez** al desplegar el contrato.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/initialize`  
**Body (raw JSON):**
```json
{
  "adminAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4"
}
```

### Respuesta `200`:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6...",
  "message": "Contrato inicializado exitosamente"
}
```

---

## Endpoint 6 — Registrar Hash [DEV — Un solo paso]

> ⚠️ Solo para testing local. Envía `ownerSecret` al backend directamente.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/dev`  
**Headers:** `Content-Type: application/json`

**Body (raw JSON):**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "ownerSecret": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

### Respuesta `200`:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6...",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3d4...",
  "certificate": {
    "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
    "timestamp": 1744329600,
    "registeredAt": "2026-04-10T12:00:00.000Z"
  },
  "_warning": "Endpoint solo para uso en desarrollo/testing"
}
```

### Error `502` (hash ya registrado):
```json
{
  "statusCode": 502,
  "message": "Simulación fallida: HostError: Error(Contract, #1)"
}
```
> `#1` = `ContractError::HashAlreadyRegistered`

---

## Endpoints 7 y 8 — Flujo de doble firma con Pago x402 (Producción / Agente IA)

Este es el flujo completo que integra el **Facilitador OZ** para validar y liquidar el pago antes de escribir en la blockchain. Requiere **tres pasos**.

---

### PASO 1 — Preparar la transacción (sin pago)

El backend simula `register_hash` en Soroban y devuelve el `ownerAuthEntryXdr` que el owner debe firmar con su keypair.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/prepare`  
**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4"
}
```

### Respuesta `200`:
```json
{
  "ownerAuthEntryXdr": "AAAAAQAAAAAAAAAB...base64...==",
  "latestLedger": 1234567,
  "expirationLedger": 1234667,
  "instructions": "Firma ownerAuthEntryXdr con tu keypair Stellar y envíalo a POST /soroban/register/submit"
}
```

> **El agente firma `ownerAuthEntryXdr` con:**  
> `authorizeEntry(entry, ownerKeypair, expirationLedger, Networks.TESTNET)` del `@stellar/stellar-sdk`

---

### PASO 2 (INTERMEDIO) — El agente construye y firma la transacción de pago

El agente/cliente debe construir una transacción Stellar que transfiera XLM al admin como pago, y la manda en el header `X-PAYMENT` en base64.

**Formato del header `X-PAYMENT`:**  
Es un JSON codificado en base64:
```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "stellar:testnet",
  "payload": {
    "signedTransaction": "<XDR base64 de la transacción de pago firmada>",
    "type": "stellar"
  }
}
```

**Requisitos de la transacción de pago:**
| Campo           | Valor                                                              |
|-----------------|--------------------------------------------------------------------|
| Destino (payTo) | `GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4`       |
| Monto           | `0.5 XLM` (5000000 stroops)                                        |
| Asset           | `native` (XLM)                                                     |
| Red             | `stellar:testnet`                                                  |
| Scheme          | `exact`                                                            |

---

### PASO 3 — Enviar al backend con pago + XDR firmado

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/submit`  
**Headers:**

| Key              | Value                                               | Descripción                         |
|------------------|-----------------------------------------------------|-------------------------------------|
| `Content-Type`   | `application/json`                                  | Requerido                           |
| `X-PAYMENT`      | `eyJ4NDAyVmVyc2lvbiI6Mi...` (base64)                | Transacción de pago firmada por el owner |

**Body (raw JSON):**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "ownerSignedAuthEntryXdr": "AAAAAQAAAAAAAAAB...base64_firmado...=="
}
```

### Respuesta exitosa `200` — Registro completado:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6a1b2c3d4e5f6...",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3d4...",
  "payment": {
    "settled": true,
    "paymentTxHash": "f9e8d7c6b5a4f9e8d7c6b5a4...",
    "networkId": "stellar:testnet"
  },
  "certificate": {
    "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
    "timestamp": 1744329600,
    "registeredAt": "2026-04-10T12:00:00.000Z"
  }
}
```

### Respuesta `402` — Sin X-PAYMENT (primera llamada sin pago):
```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "stellar:testnet",
      "maxAmountRequired": "5000000",
      "resource": "/soroban/register/submit",
      "description": "Nova Registry — Registro de hash musical en Stellar blockchain",
      "mimeType": "application/json",
      "payTo": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
      "maxTimeoutSeconds": 300,
      "asset": "native",
      "extra": { "areFeesSponsored": true }
    }
  ],
  "error": "Payment Required"
}
```
> El header `X-PAYMENT-REQUIRED` también vendrá en la respuesta con el mismo JSON en base64.

### Respuesta `402` — Pago rechazado por el facilitador:
```json
{
  "error": "payment_verification_failed",
  "message": "El facilitador rechazó el pago",
  "reason": "Invalid transaction amount"
}
```

### Respuesta `502` — El facilitador no pudo liquidar:
```json
{
  "error": "payment_settlement_failed",
  "message": "El facilitador no pudo liquidar el pago",
  "txHash": null
}
```

---

## Flujo completo en Postman (Soroban)

### Para DESARROLLO (testing rápido sin pago x402):
```
1. GET  /soroban/facilitator/supported    → verificar que el facilitador esté activo
2. GET  /soroban/count                    → cuántos hashes hay registrados
3. GET  /soroban/hash/{hash}              → verificar si el hash ya existe (404 = libre)
4. POST /soroban/register/dev             → registrar en un paso con ownerSecret
5. GET  /soroban/hash/{hash}              → confirmar registro on-chain
```

### Para PRODUCCIÓN (flujo real x402 + Facilitador OZ):
```
1. GET  /soroban/hash/{hash}              → verificar que el hash no exista
2. POST /soroban/register/prepare         → obtener ownerAuthEntryXdr
   ↓ (agente firma ownerAuthEntryXdr con authorizeEntry() y construye la tx de pago)
3. POST /soroban/register/submit          → sin X-PAYMENT → recibe 402 con requisitos
   ↓ (agente construye y firma la tx de pago Stellar en base64)
4. POST /soroban/register/submit          → con X-PAYMENT + ownerSignedAuthEntryXdr
   ↓ Backend: verify OZ → settle OZ → submit Soroban → 200 OK
5. GET  /soroban/hash/{hash}              → verificar registro on-chain con timestamp
```

---

## Errores de contrato Soroban

| Código Soroban | ContractError            | Qué significa                                           |
|----------------|--------------------------|---------------------------------------------------------|
| `#1`           | `HashAlreadyRegistered`  | El hash ya fue registrado (inmutable, no se puede duplicar) |
| `#2`           | `HashNotFound`           | El hash consultado no existe en el contrato             |

---

## Colección Postman — Soroban con Facilitador OZ (importar desde JSON)

Pega este JSON en **Postman → Import → Raw Text**:

```json
{
  "info": {
    "name": "Nova Registry — Soroban + OZ Facilitator x402",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Info del Contrato",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/soroban/info", "host": ["{{base_url}}"], "path": ["soroban", "info"] }
      }
    },
    {
      "name": "2. Facilitador OZ — Supported Kinds",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/soroban/facilitator/supported", "host": ["{{base_url}}"], "path": ["soroban", "facilitator", "supported"] }
      }
    },
    {
      "name": "3. Contar Registros",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/soroban/count", "host": ["{{base_url}}"], "path": ["soroban", "count"] }
      }
    },
    {
      "name": "4. Consultar Hash",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{base_url}}/soroban/hash/{{sample_hash}}",
          "host": ["{{base_url}}"],
          "path": ["soroban", "hash", "{{sample_hash}}"]
        }
      }
    },
    {
      "name": "5. Registrar Hash [DEV — un paso]",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\",\n  \"ownerSecret\": \"{{owner_secret}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/dev", "host": ["{{base_url}}"], "path": ["soroban", "register", "dev"] }
      }
    },
    {
      "name": "6. Preparar Registro [PROD — Fase 1]",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/prepare", "host": ["{{base_url}}"], "path": ["soroban", "register", "prepare"] }
      }
    },
    {
      "name": "7. Probar 402 — Submit sin X-PAYMENT",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\",\n  \"ownerSignedAuthEntryXdr\": \"PLACEHOLDER\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/submit", "host": ["{{base_url}}"], "path": ["soroban", "register", "submit"] }
      }
    },
    {
      "name": "8. Submit con X-PAYMENT [PROD — Fase 2 + OZ Facilitator]",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "X-PAYMENT", "value": "REEMPLAZA_CON_BASE64_JSON_PAGO_STELLAR" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\",\n  \"ownerSignedAuthEntryXdr\": \"REEMPLAZA_CON_XDR_FIRMADO_POR_OWNER\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/submit", "host": ["{{base_url}}"], "path": ["soroban", "register", "submit"] }
      }
    },
    {
      "name": "9. Inicializar Contrato (solo una vez)",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"adminAddress\": \"{{owner_address}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/initialize", "host": ["{{base_url}}"], "path": ["soroban", "initialize"] }
      }
    }
  ]
}
```

Estos endpoints interactúan **directamente** con el Smart Contract desplegado en Stellar Testnet, sin pasar por el SDK de Nova Registry. Útiles para el agente IA, para verificar el estado real de la blockchain y para testing del flujo de doble firma.

**Contract ID:** `CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD`  
**Network:** Stellar Testnet  
**Explorer:** https://stellar.expert/explorer/testnet/contract/CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD

---

## Variables de entorno de Soroban (agregar al Environment de Postman)

Agrega estas variables en tu environment `Nova Registry Local`:

| Variable          | Valor de ejemplo                                                   |
|-------------------|--------------------------------------------------------------------|
| `base_url`        | `http://localhost:3000`                                            |
| `owner_address`   | `GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4`       |
| `owner_secret`    | `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (solo dev) |
| `sample_hash`     | `0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20` |

---

## Endpoint 1 — Información del Contrato

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/info`  
**Auth:** Ninguna  
**Body:** Ninguno

### Ejemplo de respuesta `200`:
```json
{
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD",
  "network": "testnet",
  "explorerUrl": "https://stellar.expert/explorer/testnet/contract/CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD",
  "functions": ["initialize", "register_hash", "get_hash_info", "get_hash_count"]
}
```

---

## Endpoint 2 — Inicializar el Contrato

> ⚠️ Solo ejecutar **una vez** al desplegar el contrato. Si ya fue inicializado, la blockchain lo rechazará.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/initialize`  
**Headers:**

| Key            | Value              |
|----------------|--------------------|
| `Content-Type` | `application/json` |

**Body (raw JSON):**
```json
{
  "adminAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4"
}
```

> `adminAddress` debe ser la dirección pública derivada de `STELLAR_SECRET` configurado en el `.env`.

### Respuesta exitosa `200`:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "message": "Contrato inicializado exitosamente"
}
```

### Respuesta de error `400` (ya inicializado):
```json
{
  "statusCode": 400,
  "message": "Contract already initialized"
}
```

---

## Endpoint 3 — Consultar Hash (Read-Only, Gratuito)

Llama a `get_hash_info(hash)` en el contrato. No requiere auth ni pago.

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/hash/:hash`  
**Auth:** Ninguna  
**Body:** Ninguno

### Ejemplo de URL:
```
{{base_url}}/soroban/hash/0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20
```

> El hash debe ser **64 caracteres hexadecimales** (32 bytes), con o sin prefijo `0x`.

### Respuesta exitosa `200`:
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "timestamp": 1744329600,
  "registeredAt": "2026-04-10T12:00:00.000Z",
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD"
}
```

### Respuesta `404` (hash no registrado):
```json
{
  "statusCode": 404,
  "message": "Hash no registrado: 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
}
```

---

## Endpoint 4 — Contar Total de Registros (Read-Only, Gratuito)

Llama a `get_hash_count()` en el contrato. No requiere auth ni pago.

**Método:** `GET`  
**URL:** `{{base_url}}/soroban/count`  
**Auth:** Ninguna  
**Body:** Ninguno

### Respuesta exitosa `200`:
```json
{
  "totalRegistered": 42,
  "contractId": "CDNBMD3AA6QPW4SR2RSG2BO46X4SFKA6N4GLVDEGCANYTBWX57M7YNLD"
}
```

---

## Endpoint 5 — Registrar Hash en un paso (Solo DESARROLLO/DEMO)

> ⚠️ **NUNCA usar en producción.** Envía el `ownerSecret` al backend directamente. Solo válido para demos y testing local.

Ejecuta internamente las fases 1 y 2 del flujo de doble firma de forma automática.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/dev`  
**Headers:**

| Key            | Value              |
|----------------|--------------------|
| `Content-Type` | `application/json` |

**Body (raw JSON):**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "ownerSecret": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

### Respuesta exitosa `200`:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3d4...",
  "certificate": {
    "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
    "timestamp": 1744329600,
    "registeredAt": "2026-04-10T12:00:00.000Z"
  },
  "_warning": "Endpoint solo para uso en desarrollo/testing"
}
```

### Respuesta de error `502` (hash ya registrado):
```json
{
  "statusCode": 502,
  "message": "Simulación fallida: HostError: Error(Contract, #1)"
}
```

> El error `#1` corresponde a `ContractError::HashAlreadyRegistered` definido en `lib.rs`.

---

## Endpoints 6 y 7 — Flujo de doble firma (Para Agente IA / Producción)

Este es el flujo real que implementa el **Onchain Paywall** del contrato. Requiere dos llamadas.

### FASE 1 — Preparar la transacción

El backend simula la transacción y devuelve el `ownerAuthEntryXdr` que el owner debe firmar con su keypair Stellar.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/prepare`  
**Headers:**

| Key            | Value              |
|----------------|--------------------|
| `Content-Type` | `application/json` |

**Body (raw JSON):**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4"
}
```

### Respuesta exitosa `200`:
```json
{
  "ownerAuthEntryXdr": "AAAAAQAAAAAAAAAB...base64...==",
  "latestLedger": 1234567,
  "expirationLedger": 1234667,
  "instructions": "Firma ownerAuthEntryXdr con tu keypair Stellar y envíalo a POST /soroban/register/submit"
}
```

> El agente debe usar `authorizeEntry(ownerAuthEntryXdr, ownerKeypair, expirationLedger, networkPassphrase)` del Stellar SDK para firmar.

---

### FASE 2 — Enviar con doble firma (x402)

El backend valida el pago x402, agrega su firma de admin y hace submit a la blockchain.

**Método:** `POST`  
**URL:** `{{base_url}}/soroban/register/submit`  
**Headers:**

| Key                    | Value                                      | Descripción                             |
|------------------------|--------------------------------------------|-----------------------------------------|
| `Content-Type`         | `application/json`                         | Requerido                               |
| `payment-signature`    | `base64_de_la_firma_stellar`               | Firma del challenge de pago             |
| `x-stellar-public-key` | `GC6XSCI...`                               | Debe coincidir con `ownerAddress`       |
| `x-payment-nonce`      | `abc123nonce`                              | Nonce del challenge de pago             |
| `x-idempotency-key`    | `550e8400-e29b-41d4-a716-446655440000`     | UUID para idempotencia                  |

**Body (raw JSON):**
```json
{
  "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
  "ownerAddress": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
  "ownerSignedAuthEntryXdr": "AAAAAQAAAAAAAAAB...base64_firmado...=="
}
```

> `ownerSignedAuthEntryXdr` es el valor de `ownerAuthEntryXdr` de la Fase 1, firmado por el owner.

### Respuesta exitosa `200`:
```json
{
  "success": true,
  "txHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3d4...",
  "certificate": {
    "hash": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    "owner": "GC6XSCIHDDZYO46E2VKCCFH7SEPGZACWO6YX4ARN7ALVACGAL2NRKIR4",
    "timestamp": 1744329600,
    "registeredAt": "2026-04-10T12:00:00.000Z"
  }
}
```

### Respuesta `402` (sin headers de pago):
```json
{
  "error": "payment_required",
  "message": "Se requiere un micropago x402 para registrar un hash en el contrato Soroban",
  "payment": {
    "amount": "1",
    "asset": "XLM",
    "network": "testnet",
    "resource": "/soroban/register/submit",
    "requiredHeaders": [
      "payment-signature",
      "x-stellar-public-key",
      "x-payment-nonce",
      "x-idempotency-key"
    ]
  }
}
```

### Respuesta `403` (clave pública no coincide):
```json
{
  "statusCode": 403,
  "message": "La clave pública del pago no coincide con ownerAddress"
}
```

---

## Flujo completo recomendado en Postman (Soroban)

### Para DESARROLLO (testing rápido):
```
1. GET  /soroban/count                    → verificar cuántos hashes hay
2. GET  /soroban/hash/{hash}              → verificar si el hash ya existe (404 = no existe)
3. POST /soroban/register/dev             → registrar en un paso con ownerSecret
4. GET  /soroban/hash/{hash}              → confirmar que el hash quedó registrado
```

### Para PRODUCCIÓN (Agente IA / flujo x402 completo):
```
1. GET  /soroban/hash/{hash}              → verificar si ya está registrado
2. POST /soroban/register/prepare         → obtener ownerAuthEntryXdr
   ↓ (el agente firma ownerAuthEntryXdr con su keypair)
3. POST /soroban/register/submit          → enviar con headers x402 + XDR firmado
4. GET  /soroban/hash/{hash}              → verificar registro on-chain
```

---

## Errores de contrato comunes

| Código Soroban | ContractError            | Qué significa                                      |
|----------------|--------------------------|----------------------------------------------------|
| `#1`           | `HashAlreadyRegistered`  | El hash ya fue registrado antes (no se puede duplicar) |
| `#2`           | `HashNotFound`           | El hash consultado no existe en el contrato        |

---

## Colección Postman — Soroban (importar desde JSON)

Pega este JSON en **Postman → Import → Raw Text**:

```json
{
  "info": {
    "name": "Nova Registry — Soroban Direct",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Info del Contrato",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/soroban/info", "host": ["{{base_url}}"], "path": ["soroban", "info"] }
      }
    },
    {
      "name": "2. Contar Registros",
      "request": {
        "method": "GET",
        "url": { "raw": "{{base_url}}/soroban/count", "host": ["{{base_url}}"], "path": ["soroban", "count"] }
      }
    },
    {
      "name": "3. Consultar Hash",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{base_url}}/soroban/hash/{{sample_hash}}",
          "host": ["{{base_url}}"],
          "path": ["soroban", "hash", "{{sample_hash}}"]
        }
      }
    },
    {
      "name": "4. Registrar Hash [DEV]",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\",\n  \"ownerSecret\": \"{{owner_secret}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/dev", "host": ["{{base_url}}"], "path": ["soroban", "register", "dev"] }
      }
    },
    {
      "name": "5. Preparar Registro [PROD Fase 1]",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/prepare", "host": ["{{base_url}}"], "path": ["soroban", "register", "prepare"] }
      }
    },
    {
      "name": "6. Enviar Registro [PROD Fase 2 / x402]",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "payment-signature", "value": "REEMPLAZA_CON_TU_FIRMA_BASE64" },
          { "key": "x-stellar-public-key", "value": "{{owner_address}}" },
          { "key": "x-payment-nonce", "value": "REEMPLAZA_CON_NONCE" },
          { "key": "x-idempotency-key", "value": "550e8400-e29b-41d4-a716-446655440000" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"hash\": \"{{sample_hash}}\",\n  \"ownerAddress\": \"{{owner_address}}\",\n  \"ownerSignedAuthEntryXdr\": \"REEMPLAZA_CON_XDR_FIRMADO\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/register/submit", "host": ["{{base_url}}"], "path": ["soroban", "register", "submit"] }
      }
    },
    {
      "name": "7. Inicializar Contrato (solo una vez)",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"adminAddress\": \"{{owner_address}}\"\n}"
        },
        "url": { "raw": "{{base_url}}/soroban/initialize", "host": ["{{base_url}}"], "path": ["soroban", "initialize"] }
      }
    }
  ]
}
```
