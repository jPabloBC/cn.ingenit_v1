import fs from 'fs'
import path from 'path'
import { SignedXml } from 'xml-crypto'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

// Simple example worker that loads an XML invoice, signs it using a PFX-derived key
// and prints the signed XML. This is a stub for integration with SII.

async function main() {
  const xmlPath = process.env.INPUT_XML || path.resolve(process.cwd(), 'example-dte.xml')
  const p12Path = process.env.P12_PATH || process.env.P12_BASE64

  if (!fs.existsSync(xmlPath)) {
    console.error('No example XML found at', xmlPath)
    process.exit(1)
  }

  const xml = fs.readFileSync(xmlPath, 'utf8')

  // NOTE: Proper signing of DTE requires extracting private key and cert from P12 and
  // applying the SII-required signature transforms. Here we show a minimal stub using xml-crypto.

  // Load key and cert from files if provided (for real usage extract from .p12 with openssl)
  const privateKeyPath = process.env.PRIVATE_KEY_PATH
  const certPath = process.env.CERT_PATH

  if (!privateKeyPath || !certPath) {
    console.warn('PRIV_KEY_PATH or CERT_PATH not provided — performing mock-sign (not valid for SII)')
    console.log(xml)
    return
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
  const cert = fs.readFileSync(certPath, 'utf8')

  const sig = new SignedXml()
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
  sig.addReference("//DTE", [
    'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
  ])
  sig.signingKey = privateKey
  sig.keyInfoProvider = {
    getKeyInfo() { return `<X509Data><X509Certificate>${cert.replace(/-----\w+ CERTIFICATE-----|\n/g,'')}</X509Certificate></X509Data>` },
    getKey() { return privateKey }
  }

  sig.computeSignature(xml)
  const signedXml = sig.getSignedXml()

  console.log('--- Signed XML (truncated) ---')
  console.log(signedXml.slice(0, 2000))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
