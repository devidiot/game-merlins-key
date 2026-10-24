/**
 * 화면과 상관없는 규칙(이름, 공개 일정, 생명, 백업 코드)을 시험한다.
 *
 *   node scripts/test-logic.mjs
 */
import assert from 'node:assert/strict';
import { cleanName } from '../src/names.ts';
import { applyReleases, BATCHES, DAY_MS, lastOpenStage, nextRelease } from '../src/release.ts';
import { encodeBackup, decodeBackup } from '../src/backup.ts';
import { newProfile, sanitizeProfile } from '../src/storage.ts';
import { gainLife, LIFE_REFILL_MS, MAX_LIVES, nextLifeAt, refillLives, spendLife } from '../src/lives.ts';

let count = 0;
const test = async (name, fn) => {
  try {
    await fn();
    count++;
  } catch (e) {
    console.error(`실패: ${name}\n${e.stack}`);
    process.exit(1);
  }
};

// ---------------------------------------------------------------- 이름

await test('이름: 여러 문자와 공백 정리', () => {
  assert.equal(cleanName('  멀린  '), '멀린');
  assert.equal(cleanName('Mer   lin'), 'Mer lin');
  assert.equal(cleanName('梅林'), '梅林');
  assert.equal(cleanName('マーリン'), 'マーリン');
  assert.equal(cleanName('‎멀\u0000린\n'), '멀린');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(''), null);
});

await test('이름: 12글자에서 자르고 이모지는 한 글자로 센다', () => {
  assert.equal(cleanName('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타');
  assert.equal([...new Intl.Segmenter().segment(cleanName('🧙‍♂️'.repeat(15)))].length, 12);
});

await test('이름: 같은 글자는 정규화해서 같은 이름이 된다', () => {
  assert.equal(cleanName('가'), cleanName('가'));
});

// ---------------------------------------------------------------- 공개 일정

const T0 = Date.UTC(2026, 9, 23, 4, 0, 0);
/** 스테이지 0..last 를 at 시각에 깬 것으로 한다 */
const clearUpTo = (p, last, at) => {
  for (let s = 0; s <= last; s++) p.clearedAt[s] ??= at;
  p.unlocked = Math.max(p.unlocked, last + 1);
};
const collectRunes = (p, first, last, at) => {
  for (let s = first; s <= last; s++) {
    if (!p.runes.includes(s)) p.runes.push(s);
    p.runeAt[s] ??= at;
  }
};

await test('공개: 묶음은 1~30, 31~50, 그 뒤 20개씩', () => {
  assert.deepEqual(BATCHES[0], { first: 0, last: 29 });
  assert.deepEqual(BATCHES[1], { first: 30, last: 49 });
  assert.deepEqual(BATCHES[2], { first: 50, last: 69 });
  assert.deepEqual(BATCHES.at(-1), { first: 190, last: 199 });
});

await test('공개: 처음에는 30까지, 30을 깨면 즉시 50까지', () => {
  const p = newProfile('a', T0);
  assert.equal(lastOpenStage(p), 29);
  clearUpTo(p, 28, T0 + DAY_MS);
  assert.equal(applyReleases(p, T0 + DAY_MS), false);
  clearUpTo(p, 29, T0 + 2 * DAY_MS);
  assert.equal(applyReleases(p, T0 + 2 * DAY_MS), true);
  assert.equal(lastOpenStage(p), 49);
  assert.equal(p.openedAt[1], T0 + 2 * DAY_MS);
});

await test('공개: 50까지 깨고 7일이 지나야 51~70', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 29, T0);
  applyReleases(p, T0);
  clearUpTo(p, 49, T0 + DAY_MS);
  assert.equal(applyReleases(p, T0 + 6 * DAY_MS), false);
  assert.equal(nextRelease(p).earliestAt, T0 + 7 * DAY_MS);
  assert.equal(applyReleases(p, T0 + 7 * DAY_MS), true);
  assert.equal(lastOpenStage(p), 69);
  assert.equal(p.openedAt[2], T0 + 7 * DAY_MS);
});

await test('공개: 쉬는 동안 묶음이 쌓이지 않는다', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 29, T0);
  applyReleases(p, T0);
  // 31~50 을 하나도 안 깨고 한 달
  assert.equal(applyReleases(p, T0 + 30 * DAY_MS), false);
  assert.equal(lastOpenStage(p), 49);
  // 한 달 뒤 50까지 깨면 51~70 하나만 바로 열린다
  clearUpTo(p, 49, T0 + 30 * DAY_MS);
  applyReleases(p, T0 + 30 * DAY_MS);
  assert.equal(lastOpenStage(p), 69);
  assert.equal(p.openedAt[2], T0 + 30 * DAY_MS);
  // 그다음 묶음은 그때부터 다시 7일
  clearUpTo(p, 69, T0 + 31 * DAY_MS);
  assert.equal(applyReleases(p, T0 + 36 * DAY_MS), false);
  assert.equal(applyReleases(p, T0 + 37 * DAY_MS), true);
  assert.equal(lastOpenStage(p), 89);
});

await test('공개: 최근 묶음 룬을 3일 안에 다 모으면 4일째 공개', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 29, T0);
  applyReleases(p, T0);
  clearUpTo(p, 49, T0 + DAY_MS);
  collectRunes(p, 30, 49, T0 + DAY_MS);
  const next = nextRelease(p);
  assert.equal(next.hasRuneBonus, true);
  assert.equal(next.earliestAt, T0 + 3 * DAY_MS);
  assert.equal(applyReleases(p, T0 + 3 * DAY_MS - 1), false);
  assert.equal(applyReleases(p, T0 + 3 * DAY_MS), true);
});

await test('공개: 3~7일 사이에 룬을 다 모으면 그 순간 공개', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 29, T0);
  applyReleases(p, T0);
  clearUpTo(p, 49, T0 + DAY_MS);
  collectRunes(p, 30, 48, T0 + DAY_MS);
  assert.equal(applyReleases(p, T0 + 5 * DAY_MS), false);
  collectRunes(p, 49, 49, T0 + 5 * DAY_MS);
  assert.equal(applyReleases(p, T0 + 5 * DAY_MS), true);
  assert.equal(p.openedAt[2], T0 + 5 * DAY_MS);
});

await test('공개: 앞 묶음의 룬은 보상 조건에 들지 않는다', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 29, T0);
  collectRunes(p, 0, 29, T0);
  applyReleases(p, T0);
  clearUpTo(p, 49, T0);
  assert.equal(nextRelease(p).hasRuneBonus, false);
});

await test('공개: 시각을 모르면 시간 조건이 필요한 묶음은 열지 않는다', () => {
  const p = newProfile('a', T0);
  clearUpTo(p, 49, T0);
  assert.equal(applyReleases(p, null), true); // 31~50 은 시간 조건이 없다
  assert.equal(lastOpenStage(p), 49);
});

// ---------------------------------------------------------------- 생명

const HOUR = 60 * 60 * 1000;

await test('생명: 처음에는 5개, 가득 차 있으면 시계가 돌지 않는다', () => {
  const p = newProfile('a', T0);
  assert.equal(p.lives, 5);
  assert.equal(nextLifeAt(p, 5), null);
  assert.equal(refillLives(p, 5, T0 + 10 * HOUR), false);
  assert.equal(p.lives, 5);
});

await test('생명: 상한에서 떨어진 순간부터 2시간마다 1개씩 찬다', () => {
  const p = newProfile('a', T0);
  // 가득 찬 채로 하루가 지난 뒤 쓴다: 그 전 시간은 쌓이지 않는다
  spendLife(p, 5, T0 + 24 * HOUR);
  spendLife(p, 5, T0 + 24 * HOUR + 1000);
  assert.equal(p.lives, 3);
  assert.equal(nextLifeAt(p, 5), T0 + 26 * HOUR);
  refillLives(p, 5, T0 + 26 * HOUR - 1);
  assert.equal(p.lives, 3);
  refillLives(p, 5, T0 + 27 * HOUR);
  assert.equal(p.lives, 4);
  assert.equal(nextLifeAt(p, 5), T0 + 28 * HOUR);
  refillLives(p, 5, T0 + 100 * HOUR);
  assert.equal(p.lives, 5);
  assert.equal(nextLifeAt(p, 5), null);
});

await test('생명: 0개가 되면 2시간 뒤 1개', () => {
  const p = newProfile('a', T0);
  for (let i = 0; i < 6; i++) spendLife(p, 5, T0);
  assert.equal(p.lives, 0);
  refillLives(p, 5, T0 + LIFE_REFILL_MS);
  assert.equal(p.lives, 1);
});

await test('생명: 요정으로는 상한을 넘지만 시간으로는 넘지 않는다', () => {
  const p = newProfile('a', T0);
  gainLife(p, 5, T0);
  gainLife(p, 5, T0);
  assert.equal(p.lives, 7);
  refillLives(p, 5, T0 + 10 * HOUR);
  assert.equal(p.lives, 7);
  // 상한 위에서 쓰면 시계가 돌지 않고, 상한 아래로 떨어진 뒤부터 돈다
  spendLife(p, 5, T0 + 10 * HOUR);
  spendLife(p, 5, T0 + 10 * HOUR);
  assert.equal(nextLifeAt(p, 5), null);
  spendLife(p, 5, T0 + 11 * HOUR);
  assert.equal(nextLifeAt(p, 5), T0 + 13 * HOUR);
  for (let i = 0; i < 30; i++) gainLife(p, 5, T0);
  assert.equal(p.lives, MAX_LIVES);
});

await test('생명: 룬 보너스로 상한이 오르면 그만큼 더 찬다', () => {
  const p = newProfile('a', T0);
  refillLives(p, 6, T0);
  refillLives(p, 6, T0 + LIFE_REFILL_MS);
  assert.equal(p.lives, 6);
});

await test('생명: 생명이 없던 예전 기록은 가득 찬 채로 읽는다', () => {
  const old = newProfile('a', T0);
  delete old.lives;
  delete old.livesAt;
  delete old.isMidStage;
  const p = sanitizeProfile(old, T0 + HOUR);
  assert.equal(p.lives, 5);
  assert.equal(p.livesAt, T0 + HOUR);
  assert.equal(p.isMidStage, false);
});

// ---------------------------------------------------------------- 백업 코드

await test('백업: 코드로 바꿨다가 되돌리면 같은 기록', async () => {
  const p = newProfile('멀린🧙', T0);
  clearUpTo(p, 33, T0 + DAY_MS);
  collectRunes(p, 0, 5, T0);
  p.secretsCleared = [0];
  p.best = 123456;
  applyReleases(p, T0 + DAY_MS);
  const code = await encodeBackup(p);
  assert.match(code, /^MK1\.[zj][A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const back = await decodeBackup(code, T0);
  assert.deepEqual(back.profile, p);
});

await test('백업: 공백·줄바꿈이 끼어도 읽는다', async () => {
  const p = newProfile('Merlin', T0);
  const code = await encodeBackup(p);
  const spaced = code.slice(0, 10) + '\n  ' + code.slice(10);
  assert.deepEqual((await decodeBackup(spaced, T0)).profile, p);
});

await test('백업: 글자가 바뀌거나 형식이 틀리면 거절', async () => {
  const code = await encodeBackup(newProfile('Merlin', T0));
  const i = code.indexOf('.') + 5;
  const broken = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  assert.equal((await decodeBackup(broken, T0)).error, 'checksum');
  assert.equal((await decodeBackup('hello', T0)).error, 'format');
  assert.equal((await decodeBackup('MK1..00000000', T0)).error, 'format');
});

console.log(`규칙 시험 ${count}개 통과 (이름, 공개 일정, 생명, 백업 코드)`);
