import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import test from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  addressesEqual,
  compareHashes,
  evmAddressFromUncompressed,
  extractSigningAddresses,
  personalSignHash,
  sha256Hex,
  verifyChatCompletion,
  verifyEcdsaPersonal,
  verifyEd25519,
} from "./near-ai-verify.ts";

test("sha256Hex matches a known UTF-8 digest", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex('{"model":"demo"}'), sha256Hex('{"model":"demo"}'));
  assert.notEqual(sha256Hex('{"model":"demo"}'), sha256Hex('{"model":"demo","x":1}'));
});

test("compareHashes accepts a gateway text of request:response", () => {
  const request = sha256Hex('{"ok":true}');
  const response = sha256Hex('{"id":"chat"}');
  const check = compareHashes(`${request}:${response}`, request, response);
  assert.equal(check.valid, true);
  assert.equal(check.requestHashMatch, true);
  assert.equal(check.responseHashMatch, true);
  assert.equal(check.modelIdMatch, null);
});

test("compareHashes accepts a provider_tee text and checks the model id", () => {
  const request = sha256Hex("req");
  const response = sha256Hex("res");
  const ok = compareHashes(`z-ai/glm-5.3-flash:${request}:${response}`, request, response, "z-ai/glm-5.3-flash");
  assert.equal(ok.valid, true);
  assert.equal(ok.modelIdMatch, true);
  const wrongModel = compareHashes(`other-model:${request}:${response}`, request, response, "z-ai/glm-5.3-flash");
  assert.equal(wrongModel.valid, false);
  assert.equal(wrongModel.modelIdMatch, false);
  const mismatch = compareHashes(`${request}:${sha256Hex("nope")}`, request, response);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.responseHashMatch, false);
});

test("verifyEd25519 accepts a signature over the official text against a 32-byte address", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const address = rawPub.toString("hex");
  const text = `${sha256Hex("req")}:${sha256Hex("res")}`;
  const signature = nodeSign(null, Buffer.from(text, "utf8"), privateKey).toString("hex");
  assert.equal(verifyEd25519(text, signature, [address]).valid, true);
  assert.equal(verifyEd25519(text, signature, ["11".repeat(32)]).valid, false);
  assert.equal(verifyEd25519("tampered", signature, [address]).valid, false);
});

test("verifyEcdsaPersonal recovers an EIP-191 address", () => {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const address = evmAddressFromUncompressed(pub);
  const text = `${sha256Hex("req")}:${sha256Hex("res")}`;
  const hash = personalSignHash(text);
  const recoveredFmt = secp256k1.sign(hash, priv, { prehash: false, format: "recovered" });
  const ethSig = Buffer.concat([Buffer.from(recoveredFmt.subarray(1)), Buffer.from([recoveredFmt[0] + 27])]);
  const result = verifyEcdsaPersonal(text, `0x${ethSig.toString("hex")}`, [address]);
  assert.equal(result.valid, true);
  assert.ok(result.recovered && addressesEqual(result.recovered, address));
  const wrong = verifyEcdsaPersonal(text, `0x${ethSig.toString("hex")}`, ["0x" + "11".repeat(20)]);
  assert.equal(wrong.valid, false);
});

test("verifyChatCompletion is true only when hashes, signature, and attestation all match", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const address = rawPub.toString("hex");
  const requestBody = JSON.stringify({ model: "z-ai/glm-5.3-flash", messages: [] });
  const responseText = JSON.stringify({ id: "chat-1", choices: [{ message: { content: "hello" } }] });
  const text = `${sha256Hex(requestBody)}:${sha256Hex(responseText)}`;
  const signature = nodeSign(null, Buffer.from(text, "utf8"), privateKey).toString("base64");
  const attested = { gateway: [address], modelTee: [] };
  const payload = {
    requestBody,
    responseText,
    model: "z-ai/glm-5.3-flash",
    signature: {
      text,
      signature,
      signing_address: address,
      signing_algo: "ed25519",
      signature_kind: "gateway" as const,
    },
    attested,
  };
  const ok = verifyChatCompletion(payload);
  assert.equal(ok.verified, true);
  assert.equal(ok.addressMatch, true);
  assert.equal(ok.signatureValid, true);
  assert.match(ok.note, /gateway TEE/);

  const hashMismatch = verifyChatCompletion({ ...payload, responseText: responseText + " " });
  assert.equal(hashMismatch.verified, false);
  assert.match(hashMismatch.note, /hash did not match/);

  const unattested = verifyChatCompletion({
    ...payload,
    attested: { gateway: ["22".repeat(32)], modelTee: [] },
  });
  assert.equal(unattested.verified, false);
  assert.equal(unattested.addressMatch, false);
  assert.match(unattested.note, /not in the attestation report/);
});

test("extractSigningAddresses reads gateway and model TEE fields", () => {
  const extracted = extractSigningAddresses({
    gateway_attestation: { signing_address: "aa".repeat(32) },
    model_attestations: [{ signing_address: "0x" + "bb".repeat(20) }],
  });
  assert.deepEqual(extracted.gateway, ["aa".repeat(32)]);
  assert.equal(extracted.modelTee.length, 1);
  assert.ok(extracted.modelTee[0].toLowerCase().endsWith("bb".repeat(20)));
});

test("keccak personal-sign prefix is the EIP-191 form", () => {
  const hash = Buffer.from(personalSignHash("hello")).toString("hex");
  const prefix = Buffer.from("\x19Ethereum Signed Message:\n5hello", "utf8");
  const expected = Buffer.from(keccak_256(prefix)).toString("hex");
  assert.equal(hash, expected);
});
