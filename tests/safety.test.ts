import test from "node:test";
import assert from "node:assert/strict";
import { assessRisk, isHarmfulReply, canRequestPrivate, publicAuthor } from "../lib/safety";
import { screen } from "../lib/moderation";
import { seal, open } from "../lib/crypto";

test("crisis language is detected, normal sadness is not a crisis", () => {
  assert.equal(assessRisk("I want to die"), "crisis");
  assert.equal(assessRisk("I'm so tired today"), "none");
});
test("replies that encourage self-harm are blocked", () => assert.equal(isHarmfulReply("nobody would miss you"), true));
test("minors and adults can never start private chats", () => {
  assert.equal(canRequestPrivate({ isMinor: true }, { isMinor: false, allowRequests: true }), false);
  assert.equal(canRequestPrivate({ isMinor: false }, { isMinor: true, allowRequests: true }), false);
  assert.equal(canRequestPrivate({ isMinor: true }, { isMinor: true, allowRequests: true }), true);
  assert.equal(canRequestPrivate({ isMinor: false }, { isMinor: false, allowRequests: false }), false);
});
test("anonymous posts never expose a name", () => assert.deepEqual(publicAuthor({ identity: "anonymous", nickname: "Kip" }), { label: "Anonymous" }));
test("grooming-style and spam text is flagged for review", () => { assert.equal(screen("how old are you? add me on snap"), "flagged"); assert.equal(screen("Today was hard but I'm okay"), "approved"); });
test("encryption round-trips and is not plaintext", () => {
  process.env.DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  const b = seal("private thought"); assert.equal(open(b), "private thought"); assert.equal(b.includes("private"), false);
});
