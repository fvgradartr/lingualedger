import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export type SignatureKind = "provider_tee" | "gateway" | "unknown";
export type SigningAlgo = "ed25519" | "ecdsa" | "unknown";

export interface ChatSignature {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo?: string;
  signature_kind?: string;
}

export interface HashCheck {
  valid: boolean;
  requestHashMatch: boolean;
  responseHashMatch: boolean;
  modelIdMatch: boolean | null;
  signedModelId: string | null;
  signedRequestHash: string | null;
  signedResponseHash: string | null;
  error?: string;
}

export interface AttestedAddresses {
  gateway: string[];
  modelTee: string[];
}

export interface VerifyChatResult {
  verified: boolean;
  note: string;
  kind: SignatureKind;
  signingAlgo: SigningAlgo;
  hashes: HashCheck;
  signatureValid: boolean;
  addressMatch: boolean;
  signingAddress: string;
}

const ATTEST_TTL_MS = 10 * 60 * 1000;
const attestCache = new Map<string, { at: number; addresses: AttestedAddresses }>();

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function normalizeHex(value: string): string {
  return value.trim().replace(/^0x/i, "").toLowerCase();
}

export function addressesEqual(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return normalizeHex(a) === normalizeHex(b) && normalizeHex(a).length > 0;
}

export function resolveSignatureKind(signature: ChatSignature): SignatureKind {
  if (signature.signature_kind === "provider_tee" || signature.signature_kind === "gateway") {
    return signature.signature_kind;
  }
  const parts = (signature.text || "").split(":");
  if (parts.length === 3) return "provider_tee";
  if (parts.length === 2) return "gateway";
  return "unknown";
}

export function resolveSigningAlgo(signature: ChatSignature): SigningAlgo {
  const algo = (signature.signing_algo || "").toLowerCase();
  if (algo === "ed25519" || algo === "ecdsa") return algo;
  const addr = normalizeHex(signature.signing_address || "");
  if (addr.length === 64) return "ed25519";
  if (addr.length === 40) return "ecdsa";
  const sigBytes = decodeSignatureBytes(signature.signature || "");
  if (sigBytes.length === 64) return "ed25519";
  if (sigBytes.length === 65) return "ecdsa";
  return "unknown";
}

export function compareHashes(
  signatureText: string,
  expectedRequestHash: string,
  expectedResponseHash: string,
  expectedModelId?: string,
): HashCheck {
  try {
    const parts = signatureText.split(":");
    if (parts.length !== 2 && parts.length !== 3) {
      return {
        valid: false,
        requestHashMatch: false,
        responseHashMatch: false,
        modelIdMatch: null,
        signedModelId: null,
        signedRequestHash: null,
        signedResponseHash: null,
        error: `Expected 2 or 3 ':'-separated parts in signed text, got ${parts.length}`,
      };
    }
    const hasModelId = parts.length === 3;
    const signedModelId = hasModelId ? parts[0] : null;
    const signedRequestHash = hasModelId ? parts[1] : parts[0];
    const signedResponseHash = hasModelId ? parts[2] : parts[1];
    const requestHashMatch = signedRequestHash === expectedRequestHash;
    const responseHashMatch = signedResponseHash === expectedResponseHash;
    const modelIdMatch = hasModelId && expectedModelId ? signedModelId === expectedModelId : null;
    return {
      valid: requestHashMatch && responseHashMatch && modelIdMatch !== false,
      requestHashMatch,
      responseHashMatch,
      modelIdMatch,
      signedModelId,
      signedRequestHash,
      signedResponseHash,
    };
  } catch (error) {
    return {
      valid: false,
      requestHashMatch: false,
      responseHashMatch: false,
      modelIdMatch: null,
      signedModelId: null,
      signedRequestHash: null,
      signedResponseHash: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function personalSignHash(message: string): Uint8Array {
  const msg = Buffer.from(message, "utf8");
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`, "utf8");
  return keccak_256(Buffer.concat([prefix, msg]));
}

export function evmAddressFromUncompressed(pub: Uint8Array): string {
  const raw = pub.length === 65 && pub[0] === 4 ? pub.subarray(1) : pub;
  const hash = keccak_256(raw);
  return `0x${Buffer.from(hash.subarray(-20)).toString("hex")}`;
}

export function decodeSignatureBytes(signature: string): Buffer {
  const trimmed = signature.trim();
  if (!trimmed) return Buffer.alloc(0);
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    if (hex.length === 128 || hex.length === 130 || hex.length === 64 || hex.length === 132) {
      return Buffer.from(hex, "hex");
    }
  }
  try {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 64 || buf.length === 65 || buf.length === 66) return buf;
  } catch {
    // fall through
  }
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(trimmed, "base64");
}

export function verifyEcdsaPersonal(
  message: string,
  signature: string,
  expectedAddresses: string[],
): { valid: boolean; recovered: string | null; error?: string } {
  try {
    const raw = decodeSignatureBytes(signature);
    if (raw.length < 65) {
      return { valid: false, recovered: null, error: `ECDSA signature is shorter than 65 bytes (${raw.length}).` };
    }
    // Ethereum personal_sign is r || s || v. A leading recovery id (noble "recovered") is also accepted.
    let compact: Buffer;
    let v: number;
    if (raw.length === 65 && raw[0] <= 3 && raw[64] > 3) {
      // ambiguous; prefer Ethereum r||s||v when last byte looks like v
      compact = raw.subarray(0, 64);
      v = raw[64];
    } else if (raw.length === 65 && raw[0] <= 3 && raw[64] <= 3) {
      // last byte could be 0/1 Ethereum v without +27; also first could be noble recid.
      // Prefer Ethereum r||s||v (v at the end), which is what the official example uses.
      compact = raw.subarray(0, 64);
      v = raw[64];
    } else if (raw[0] <= 3 && raw.length === 65) {
      compact = raw.subarray(1);
      v = raw[0];
    } else {
      compact = raw.subarray(0, 64);
      v = raw[64] ?? 0;
    }
    if (v >= 27) v -= 27;
    if (v > 3) v = v % 2;
    const hash = personalSignHash(message);
    const pub = secp256k1.Signature.fromBytes(compact).addRecoveryBit(v).recoverPublicKey(hash);
    const recovered = evmAddressFromUncompressed(pub.toBytes(false));
    const valid = expectedAddresses.some((addr) => addressesEqual(addr, recovered));
    return { valid, recovered };
  } catch (error) {
    return {
      valid: false,
      recovered: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyEd25519(
  message: string,
  signature: string,
  expectedAddresses: string[],
): { valid: boolean; error?: string } {
  const msg = Buffer.from(message, "utf8");
  const sigBuf = decodeSignatureBytes(signature);
  if (sigBuf.length !== 64) {
    return { valid: false, error: `ed25519 signature must be 64 bytes, got ${sigBuf.length}.` };
  }
  for (const addr of expectedAddresses) {
    try {
      const raw = Buffer.from(normalizeHex(addr), "hex");
      if (raw.length !== 32) continue;
      const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
      if (cryptoVerify(null, msg, key, sigBuf)) return { valid: true };
    } catch {
      // try the next attested address
    }
  }
  return { valid: false, error: "ed25519 signature did not match any attested address." };
}

export function expectedAddressesFor(kind: SignatureKind, attested: AttestedAddresses): string[] {
  if (kind === "provider_tee") return attested.modelTee.filter(Boolean);
  if (kind === "gateway") return attested.gateway.filter(Boolean);
  return [...attested.gateway, ...attested.modelTee].filter(Boolean);
}

export function verifyChatCompletion(input: {
  requestBody: string;
  responseText: string;
  model: string;
  signature: ChatSignature;
  attested: AttestedAddresses;
}): VerifyChatResult {
  const kind = resolveSignatureKind(input.signature);
  const signingAlgo = resolveSigningAlgo(input.signature);
  const hashes = compareHashes(
    input.signature.text,
    sha256Hex(input.requestBody),
    sha256Hex(input.responseText),
    input.model,
  );
  const expected = expectedAddressesFor(kind, input.attested);
  const claimed = input.signature.signing_address || "";
  const addressMatch = Boolean(claimed) && expected.some((addr) => addressesEqual(addr, claimed));

  let signatureValid = false;
  let sigError: string | undefined;
  if (expected.length === 0) {
    sigError = "The attestation report had no signing address for this signature kind.";
  } else if (signingAlgo === "ed25519") {
    const result = verifyEd25519(input.signature.text, input.signature.signature, expected);
    signatureValid = result.valid;
    sigError = result.error;
  } else if (signingAlgo === "ecdsa") {
    const result = verifyEcdsaPersonal(input.signature.text, input.signature.signature, expected);
    signatureValid = result.valid;
    sigError = result.error;
  } else {
    sigError = "Unknown signing algorithm; the signature was not verified.";
  }

  const verified = hashes.valid && signatureValid && addressMatch;
  return {
    verified,
    note: verificationNote({ verified, kind, hashes, signatureValid, addressMatch, sigError, expectedEmpty: expected.length === 0 }),
    kind,
    signingAlgo,
    hashes,
    signatureValid,
    addressMatch,
    signingAddress: claimed,
  };
}

function verificationNote(input: {
  verified: boolean;
  kind: SignatureKind;
  hashes: HashCheck;
  signatureValid: boolean;
  addressMatch: boolean;
  sigError?: string;
  expectedEmpty: boolean;
}): string {
  if (input.verified) {
    if (input.kind === "provider_tee") {
      return "NEAR AI Cloud signed this response inside the model TEE. The request and response hashes match, and the signature verifies against the attested signing address.";
    }
    if (input.kind === "gateway") {
      return "NEAR AI Cloud signed this response inside the gateway TEE (Intel TDX). The request and response hashes match, and the signature verifies against the attested gateway signing address.";
    }
    return "NEAR AI Cloud signed this response. The request and response hashes match, and the signature verifies against the attested signing address.";
  }
  const reasons: string[] = [];
  if (!input.hashes.valid) reasons.push("the signed request or response hash did not match what this server sent and received");
  if (input.expectedEmpty) reasons.push("the attestation report had no signing address to check against");
  else if (!input.addressMatch) reasons.push("the signing address on the chat signature was not in the attestation report");
  if (!input.signatureValid) {
    reasons.push(input.sigError ? `the signature did not verify (${input.sigError})` : "the signature did not verify against the attested address");
  }
  const detail = reasons.length > 0 ? reasons.join("; ") : "verification did not pass";
  return `The completion ran on NEAR AI Cloud, but ${detail}, so it is not marked verified.`;
}

export function extractSigningAddresses(report: unknown): AttestedAddresses {
  const gateway = new Set<string>();
  const modelTee = new Set<string>();

  const take = (target: Set<string>, value: unknown) => {
    if (typeof value === "string" && value.trim()) target.add(value.trim());
  };
  const fromObject = (target: Set<string>, value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    take(target, record.signing_address);
    take(target, record.signingAddress);
    if (Array.isArray(record.signing_addresses)) {
      for (const item of record.signing_addresses) take(target, item);
    }
  };

  if (report && typeof report === "object") {
    const root = report as Record<string, unknown>;
    fromObject(gateway, root.gateway_attestation);
    fromObject(gateway, root.gatewayAttestation);
    take(gateway, root.signing_address);
    const models = root.model_attestations ?? root.modelAttestations;
    if (Array.isArray(models)) {
      for (const item of models) fromObject(modelTee, item);
    } else {
      fromObject(modelTee, models);
    }
  }
  return { gateway: [...gateway], modelTee: [...modelTee] };
}

async function httpJson(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    const snippet = text.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`${response.status} ${response.statusText}${snippet ? `: ${snippet}` : ""}`);
  }
  return text ? (JSON.parse(text) as unknown) : {};
}

export async function fetchAttestation(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  algo: string;
}): Promise<AttestedAddresses> {
  const cacheKey = `${input.baseUrl}|${input.model}|${input.algo}`;
  const cached = attestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ATTEST_TTL_MS) return cached.addresses;
  const base = input.baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ signing_algo: input.algo, model: input.model });
  const report = await httpJson(`${base}/attestation/report?${params.toString()}`, input.apiKey);
  const addresses = extractSigningAddresses(report);
  attestCache.set(cacheKey, { at: Date.now(), addresses });
  return addresses;
}

export function clearAttestationCache(): void {
  attestCache.clear();
}

export async function fetchChatSignature(input: {
  apiKey: string;
  baseUrl: string;
  chatId: string;
  model: string;
  algo: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<ChatSignature> {
  const retries = input.retries ?? 4;
  const retryDelayMs = input.retryDelayMs ?? 700;
  const base = input.baseUrl.replace(/\/$/, "");
  const url =
    `${base}/signature/${encodeURIComponent(input.chatId)}` +
    `?model=${encodeURIComponent(input.model)}&signing_algo=${encodeURIComponent(input.algo)}`;
  let lastError = "signature request failed";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = (await httpJson(url, input.apiKey)) as ChatSignature;
      if (!payload?.text || !payload.signature) {
        throw new Error("signature response was missing text or signature");
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const is404 = lastError.startsWith("404");
      if (!is404 || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(lastError);
}

export async function verifyNearAiCompletion(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestBody: string;
  responseText: string;
  chatId: string | null;
}): Promise<{ verified: boolean; note: string; teeSigId: string; kind: SignatureKind; signingAlgo: SigningAlgo }> {
  const teeSigId = input.chatId || "";
  if (!input.chatId) {
    return {
      verified: false,
      note: "The completion ran on NEAR AI Cloud, but the response had no chat id, so a TEE signature could not be fetched. It is not marked verified.",
      teeSigId,
      kind: "unknown",
      signingAlgo: "unknown",
    };
  }

  const algos = ["ed25519", "ecdsa"] as const;
  let lastFetchError = "";
  for (const algo of algos) {
    let signature: ChatSignature;
    try {
      signature = await fetchChatSignature({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        chatId: input.chatId,
        model: input.model,
        algo,
      });
    } catch (error) {
      lastFetchError = error instanceof Error ? error.message : String(error);
      continue;
    }
    let attested: AttestedAddresses = { gateway: [], modelTee: [] };
    try {
      attested = await fetchAttestation({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        algo,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        verified: false,
        note: `The completion ran on NEAR AI Cloud, but the attestation report could not be fetched (${detail}), so it is not marked verified.`,
        teeSigId: input.chatId,
        kind: resolveSignatureKind(signature),
        signingAlgo: resolveSigningAlgo({ ...signature, signing_algo: signature.signing_algo || algo }),
      };
    }
    const result = verifyChatCompletion({
      requestBody: input.requestBody,
      responseText: input.responseText,
      model: input.model,
      signature: { ...signature, signing_algo: signature.signing_algo || algo },
      attested,
    });
    return {
      verified: result.verified,
      note: result.note,
      teeSigId: input.chatId,
      kind: result.kind,
      signingAlgo: result.signingAlgo,
    };
  }

  return {
    verified: false,
    note: `The completion ran on NEAR AI Cloud, but a TEE signature could not be fetched (${lastFetchError || "no signing algorithm succeeded"}), so it is not marked verified.`,
    teeSigId: input.chatId,
    kind: "unknown",
    signingAlgo: "unknown",
  };
}
