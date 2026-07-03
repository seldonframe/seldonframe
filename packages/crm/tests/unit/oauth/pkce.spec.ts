import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCodeChallengeS256, verifyPkce } from "@/lib/oauth/pkce";

describe("computeCodeChallengeS256", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    // RFC 7636 Appendix B: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    assert.equal(computeCodeChallengeS256(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("verifyPkce", () => {
  it("accepts a correct verifier for method S256", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    assert.equal(verifyPkce({ verifier, challenge, method: "S256" }), true);
  });

  it("rejects an incorrect verifier", () => {
    assert.equal(
      verifyPkce({ verifier: "wrong-verifier", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", method: "S256" }),
      false
    );
  });

  it("rejects method 'plain' unconditionally (S256-only design constraint)", () => {
    // Even if verifier === challenge (which is what "plain" would accept),
    // this codebase never honors "plain" — the AS metadata only advertises
    // S256 and this function enforces that at the verification layer too,
    // not just at the advertised-capability layer.
    assert.equal(verifyPkce({ verifier: "same-value", challenge: "same-value", method: "plain" as never }), false);
  });

  it("rejects an empty verifier", () => {
    assert.equal(verifyPkce({ verifier: "", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", method: "S256" }), false);
  });

  it("rejects an empty challenge", () => {
    assert.equal(verifyPkce({ verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", challenge: "", method: "S256" }), false);
  });
});
