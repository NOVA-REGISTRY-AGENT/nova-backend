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
