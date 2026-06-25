#!/usr/bin/env node
/* Set / ganti sandi admin untuk fitur "Simpan Default Global".
 * Sandi TIDAK disimpan apa adanya — hanya hash scrypt bersalt yang ditulis ke
 * /home/ubuntu/assaamiyah/.admin_secret (mode 600, di luar web root & di luar git).
 *
 * Pakai (di terminal SSH Anda sendiri, supaya sandi tidak masuk ke mana-mana):
 *   node tools/set_admin_pass.js                # akan menanyakan sandi
 *   node tools/set_admin_pass.js 'SandiAnda'    # atau langsung sebagai argumen
 */
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');

const SECRET_FILE = '/home/ubuntu/assaamiyah/.admin_secret';

function save(pwd) {
  pwd = String(pwd).replace(/\r?\n$/, '');
  if (pwd.length < 8) { console.error('❌ Sandi minimal 8 karakter. Batal.'); process.exit(1); }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pwd, salt, 64);
  fs.writeFileSync(SECRET_FILE, `scrypt$${salt.toString('hex')}$${hash.toString('hex')}\n`, { mode: 0o600 });
  fs.chmodSync(SECRET_FILE, 0o600);
  console.log('✅ Sandi admin tersimpan (ter-hash) di', SECRET_FILE);
}

const arg = process.argv[2];
if (arg) { save(arg); }
else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Masukkan sandi admin baru (min 8 karakter): ', (ans) => { rl.close(); save(ans); });
}
