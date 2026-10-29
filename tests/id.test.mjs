import test from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '../dist/src/core/id.js';
test('IDs usam UUID quando disponível e funcionam sem randomUUID em HTTP LAN',()=>{
 assert.equal(createId({randomUUID:()=> 'uuid-local'}),'uuid-local');
 assert.equal(createId({getRandomValues:array=>{array.set([1,2,3,4]);return array;}}),'00000001-00000002-00000003-00000004');
 assert.notEqual(createId({}),createId({}));
});
