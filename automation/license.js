const fetch = require('node-fetch');
const os = require('os');
const crypto = require('crypto');
const path = require('path');

// URL del servidor de licencias (stub/mock)
const LICENSE_SERVER = 'http://localhost:3000/api/validate-license';

function getMachineId() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus()[0].model || '';
  const identifier = `${hostname}-${platform}-${arch}-${cpus}`;
  return crypto.createHash('sha256').update(identifier).digest('hex');
}

async function checkLicense() {
  try {
    const machineId = getMachineId();
    console.log(`[LICENSE] Machine ID: ${machineId.substring(0, 16)}...`);
    // Modo stub: siempre válido
    console.log('[LICENSE] Modo stub: licencia válida');
    return true;
  } catch (error) {
    console.error('[LICENSE] Error verificando licencia:', error.message);
    console.warn('[LICENSE] Continuando en modo stub...');
    return true;
  }
}

module.exports = { checkLicense, getMachineId };
