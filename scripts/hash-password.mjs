// Passwort-Hash generieren.
// Aufruf:  node scripts/hash-password.mjs "MeinNeuesPasswort"
// Ausgabe: <salt-hex>:<hash-hex>  →  in APP_USER_PASSWORD_HASH eintragen.

import { scryptSync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Nutzung: node scripts/hash-password.mjs "PasswortHier"');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`${salt.toString("hex")}:${hash.toString("hex")}`);
