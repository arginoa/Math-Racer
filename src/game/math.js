import { randInt } from "./track.js";

function makeAdd() {
  const a = randInt(1, 20);
  const b = randInt(1, 20);
  return { text: `${a} + ${b}`, answer: a + b };
}

function makeSub() {
  const a = randInt(1, 20);
  const b = randInt(1, 20);
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  return { text: `${big} - ${small}`, answer: big - small };
}

function makeMul() {
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  return { text: `${a} × ${b}`, answer: a * b };
}

function makeDiv() {
  const b = randInt(2, 9);
  const ans = randInt(2, 9);
  const a = b * ans; // <= 81
  return { text: `${a} ÷ ${b}`, answer: ans };
}

export function generateQuestion(difficulty) {
  // difficulty 0..1, but we keep it easy regardless.
  // As difficulty rises, slightly more mul/div, still small.
  const roll = Math.random();

  const mulWeight = 0.08 + difficulty * 0.08; // 0.08..0.16
  const divWeight = 0.06 + difficulty * 0.08; // 0.06..0.14
  const addWeight = 0.52 - difficulty * 0.10; // 0.52..0.42
  const subWeight = 1 - (mulWeight + divWeight + addWeight);

  let pick = roll;
  if ((pick -= addWeight) < 0) return makeAdd();
  if ((pick -= subWeight) < 0) return makeSub();
  if ((pick -= mulWeight) < 0) return makeMul();
  return makeDiv();
}