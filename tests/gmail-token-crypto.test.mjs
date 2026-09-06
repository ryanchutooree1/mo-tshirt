import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptGmailConnection,decryptGmailConnection} from '../src/lib/gmail-token-crypto.ts';
const secret='test-encryption-key-with-sufficient-entropy';
const connection={refreshToken:'private-refresh-token',clientId:'client-id',email:'motshirtmauritius@gmail.com',connectedAt:'2026-09-06',expiresAt:null};
test('refresh token is encrypted and can be recovered only with the correct key',()=>{const envelope=encryptGmailConnection(connection,secret);assert(!envelope.includes(connection.refreshToken));assert.deepEqual(decryptGmailConnection(envelope,secret),connection);assert.throws(()=>decryptGmailConnection(envelope,'another-secret-that-is-long-enough'));});
test('random nonces prevent repeated ciphertext and tampered records fail closed',()=>{const a=encryptGmailConnection(connection,secret),b=encryptGmailConnection(connection,secret);assert.notEqual(a,b);const parts=a.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);assert.throws(()=>decryptGmailConnection(parts.join('.'),secret));assert.throws(()=>encryptGmailConnection(connection,'short'));});
