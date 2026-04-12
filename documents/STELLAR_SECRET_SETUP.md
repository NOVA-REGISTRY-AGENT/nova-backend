# Cómo obtener STELLAR_SECRET

## ¿Qué es?

`STELLAR_SECRET` es la clave privada de una cuenta en la red Stellar. Tiene el formato `S...` (56 caracteres comenzando con S). Se usa para firmar los pagos del protocolo x402 que autentica el registro de assets en Nova Registry.

---

## Paso 1 — Generar el keypair en Stellar Laboratory

1. Abre el navegador y entra a:

   **https://laboratory.stellar.org/#account-creator?network=test**

2. Haz click en el botón **"Generate keypair"**.

3. Verás dos valores generados:

   ```
   Public Key:  GABCDE1234567890...  ← tu dirección pública (como un número de cuenta)
   Secret Key:  SABCDE1234567890...  ← tu STELLAR_SECRET (clave privada)
   ```

4. **Copia y guarda ambos valores** en un lugar seguro antes de cerrar la página.

> El Secret Key solo aparece una vez. Si lo pierdes, deberás generar uno nuevo.

---

## Paso 2 — Fondear la cuenta en Testnet (gratis)

Para que la cuenta pueda operar en testnet necesita al menos **1 XLM**. El Friendbot de Stellar te lo da gratis:

1. En la misma página de Stellar Laboratory, pega tu **Public Key** en el campo **"Friendbot"**.
2. Haz click en **"Get test XLM"**.
3. Recibirás 10.000 XLM de testnet de forma inmediata.

Alternativa con curl:

```bash
curl "https://friendbot.stellar.org/?addr=TU_PUBLIC_KEY"
```

Verifica el saldo en:

**https://stellar.expert/explorer/testnet/account/TU_PUBLIC_KEY**

---

## Paso 3 — Configurar el .env

Abre el archivo `.env` en la raíz del proyecto y reemplaza el valor de ejemplo:

```env
# ❌ Antes (placeholder)
STELLAR_SECRET=SABC123TU_SECRET_KEY_GENERADA_EN_LABORATORY

# ✅ Después (tu valor real)
STELLAR_SECRET=SXXXXXXXXX_TU_SECRET_KEY_REAL_AQUI
NOVA_REGISTRY_URL=https://api.nova-registry.io
STELLAR_NETWORK=testnet
PORT=3000
```

---

## Verificar que funciona

Puedes verificar que la clave está siendo leída correctamente arrancando el servidor:

```bash
npm run start:dev
```

Si el servidor levanta sin el error `getOrThrow: STELLAR_SECRET`, la configuración es correcta.

Si ves algo como:

```
Error: Config validation error: "STELLAR_SECRET" is required
```

Significa que el archivo `.env` no está en la ruta correcta o el valor está vacío.

---

## Seguridad

| Regla | Detalle |
|---|---|
| Nunca subas `.env` a Git | Verifica que `.env` está en `.gitignore` |
| No loggees el secret | El SDK ya lo maneja internamente sin exponerlo |
| Usa testnet para desarrollo | Mainnet implica XLM real con valor monetario |
| Rota las llaves en producción | Genera un keypair nuevo para cada entorno (dev / staging / prod) |

---

## Resumen rápido

```
1. https://laboratory.stellar.org  →  Generate keypair  →  copia Secret Key
2. Friendbot                       →  fondea con tu Public Key
3. Pega el Secret Key en .env      →  STELLAR_SECRET=Sxxx...
4. npm run start:dev               →  verificar que levanta sin errores
```
