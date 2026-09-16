
import forge from "node-forge";
import qz from "qz-tray";

const STORAGE_KEY_BUNDLE = "qz_tray_signing_bundle_v3";
const LEGACY_STORAGE_KEY_CERT = "qz_tray_certificate";
const LEGACY_STORAGE_KEY_KEY = "qz_tray_private_key";

interface KeyPair {
  certificate: string;
  privateKey: string;
  hostname: string;
}

const CANONICAL_QZ_HOSTNAME = "gestaodelotes.lovable.app";
const LEGACY_QZ_HOSTNAME = "gestaodeloteswee.lovable.app";

const ALL_QZ_HOSTNAMES = [
  CANONICAL_QZ_HOSTNAME,
  LEGACY_QZ_HOSTNAME,
  "localhost",
  "127.0.0.1",
];

function registerHostname(hostname: string): void {
  if (!hostname) return;
  if (!ALL_QZ_HOSTNAMES.includes(hostname)) {
    ALL_QZ_HOSTNAMES.push(hostname);
  }
}

function getCurrentHostname(): string {
  const hostname = window.location.hostname || "localhost";
  registerHostname(hostname);

  if (
    hostname.endsWith(".lovableproject.com") ||
    hostname.includes("id-preview--")
  ) {
    registerHostname(CANONICAL_QZ_HOSTNAME);
    return CANONICAL_QZ_HOSTNAME;
  }

  return hostname;
}

function extractCertificateHostname(certificatePem: string): string | null {
  try {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const commonName = cert.subject.getField("CN");
    return typeof commonName?.value === "string" ? commonName.value : null;
  } catch {
    return null;
  }
}

function extractCertificateHostnames(certificatePem: string): Set<string> {
  const hostnames = new Set<string>();

  try {
    const cert = forge.pki.certificateFromPem(certificatePem);
    const commonName = cert.subject.getField("CN")?.value;
    if (typeof commonName === "string" && commonName.trim()) {
      hostnames.add(commonName.toLowerCase());
    }

    const subjectAltName = cert.extensions?.find((ext: any) => ext.name === "subjectAltName");
    if (subjectAltName && Array.isArray((subjectAltName as any).altNames)) {
      for (const altName of (subjectAltName as any).altNames) {
        if (typeof altName?.value === "string" && altName.value.trim()) {
          hostnames.add(altName.value.toLowerCase());
        }
        if (typeof altName?.ip === "string" && altName.ip.trim()) {
          hostnames.add(altName.ip.toLowerCase());
        }
      }
    }
  } catch {
    return hostnames;
  }

  return hostnames;
}

function certificateCoversHostname(certificatePem: string, hostname: string): boolean {
  if (!hostname.trim()) return false;
  const knownHosts = extractCertificateHostnames(certificatePem);
  return knownHosts.has(hostname.toLowerCase());
}

function persistKeyPair(pair: KeyPair): void {
  localStorage.setItem(STORAGE_KEY_BUNDLE, JSON.stringify(pair));
  localStorage.removeItem(LEGACY_STORAGE_KEY_CERT);
  localStorage.removeItem(LEGACY_STORAGE_KEY_KEY);
}

function loadStoredKeyPair(): KeyPair | null {
  const raw = localStorage.getItem(STORAGE_KEY_BUNDLE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<KeyPair>;
      if (parsed.certificate && parsed.privateKey && parsed.hostname) {
        return {
          certificate: parsed.certificate,
          privateKey: parsed.privateKey,
          hostname: parsed.hostname,
        };
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY_BUNDLE);
    }
  }

  const legacyCertificate = localStorage.getItem(LEGACY_STORAGE_KEY_CERT);
  const legacyPrivateKey = localStorage.getItem(LEGACY_STORAGE_KEY_KEY);
  if (!legacyCertificate || !legacyPrivateKey) {
    return null;
  }

  return {
    certificate: legacyCertificate,
    privateKey: legacyPrivateKey,
    hostname: extractCertificateHostname(legacyCertificate) || "",
  };
}

function generateKeyPair(hostname: string): KeyPair {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = `${Date.now()}`;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: hostname },
    { name: "organizationName", value: "Porto Outlet" },
    { shortName: "C", value: "BR" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  const altNames = ALL_QZ_HOSTNAMES.map((h) => {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      return { type: 7, ip: h };
    }
    return { type: 2, value: h };
  });

  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    {
      name: "subjectAltName",
      altNames,
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certificate: forge.pki.certificateToPem(cert),
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    hostname,
  };
}

function getOrCreateKeyPair(): KeyPair {
  const hostname = getCurrentHostname();
  const storedPair = loadStoredKeyPair();

  // Keep the same key pair once generated to avoid re-prompting users after updates.
  if (storedPair?.certificate && storedPair.privateKey) {
    const certHostname = extractCertificateHostname(storedPair.certificate) || storedPair.hostname || hostname;
    const normalizedPair = {
      ...storedPair,
      hostname: certHostname,
    };

    if (certificateCoversHostname(storedPair.certificate, hostname)) {
      if (storedPair.hostname !== normalizedPair.hostname) {
        persistKeyPair(normalizedPair);
      }
      return normalizedPair;
    }

    // Backward compatibility: old certs signed for legacy production host.
    if (
      hostname === CANONICAL_QZ_HOSTNAME &&
      certificateCoversHostname(storedPair.certificate, LEGACY_QZ_HOSTNAME)
    ) {
      return normalizedPair;
    }

    if (!storedPair.hostname) {
      const backfilledPair = { ...storedPair, hostname };
      persistKeyPair(backfilledPair);
      return backfilledPair;
    }

    if (storedPair.hostname === normalizedPair.hostname) {
      return normalizedPair;
    }

    if (certificateCoversHostname(storedPair.certificate, storedPair.hostname)) {
      persistKeyPair(normalizedPair);
      return normalizedPair;
    }
  }

  const pair = generateKeyPair(hostname);
  persistKeyPair(pair);
  return pair;
}

export function getQzCertificate(): string {
  return getOrCreateKeyPair().certificate;
}

export function downloadQzCertificate(fileName = "portooutlet-qz-tray.crt"): void {
  const cert = getQzCertificate();
  const blob = new Blob([cert], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function setupQzSecurity(): void {
  const pair = getOrCreateKeyPair();

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise((resolve: (value: string) => void) => {
    resolve(pair.certificate);
  });

  qz.security.setSignaturePromise((toSign: string) => {
    return (resolve: (value: string) => void, reject: (reason?: any) => void) => {
      try {
        const privateKey = forge.pki.privateKeyFromPem(pair.privateKey);
        const md = forge.md.sha512.create();
        md.update(toSign, "utf8");
        const signature = forge.util.encode64(privateKey.sign(md));
        resolve(signature);
      } catch (err) {
        console.error("Erro ao assinar requisição QZ Tray:", err);
        reject(err);
      }
    };
  });
}


