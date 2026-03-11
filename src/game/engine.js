import { buildTrack } from "./track.js";
import { generateQuestion } from "./math.js";
import { render } from "./render.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function nowMs() {
  return performance.now();
}

export function createMathRaceEngine(canvas, callbacks) {
  const ctx = canvas.getContext("2d", { alpha: true });

  const cb = {
    onQuestion: callbacks?.onQuestion ?? (() => {}),
    onHud: callbacks?.onHud ?? (() => {}),
    onFinish: callbacks?.onFinish ?? (() => {}),
  };

  const view = { w: 0, h: 0 };
  let dpr = 1;

  let raf = 0;
  let running = false;

  let track = null;
  let trackHalfW = 56;

  const TOTAL_LAPS = 2;
  const laneFracs = [-0.55, -0.18, 0.18, 0.55];

  const PALETTE = ["#ff3b30", "#34c759", "#0a84ff", "#ffd60a"];

  let phase = "menu";
  let raceStartMs = 0;

  let playerQuestion = null;
  let playerQuestionStart = 0;
  let streak = 0;

  const cars = [
    { id: "you",  name: "YOU",   color: "#ff3b30", lane: 0, totalDist: 0, speed: 0, boost: 0, lap: 0, finished: false, finishTime: 0 },
    { id: "bot1", name: "BOT A", color: "#34c759", lane: 1, totalDist: 0, speed: 0, boost: 0, lap: 0, finished: false, finishTime: 0 },
    { id: "bot2", name: "BOT B", color: "#0a84ff", lane: 2, totalDist: 0, speed: 0, boost: 0, lap: 0, finished: false, finishTime: 0 },
    { id: "bot3", name: "BOT C", color: "#ffd60a", lane: 3, totalDist: 0, speed: 0, boost: 0, lap: 0, finished: false, finishTime: 0 },
  ];

  // Nerfed bots: slower + slightly less accurate + higher jitter
// Slightly harder bots: more accurate, faster, better boost
const bots = {
  bot1: { accuracy: 0.86, baseMs: 1650, jitter: 850, boostScale: 0.88 },
  bot2: { accuracy: 0.83, baseMs: 1550, jitter: 920, boostScale: 0.84 },
  bot3: { accuracy: 0.80, baseMs: 1450, jitter: 980, boostScale: 0.80 },
};

  const botState = {
    bot1: { q: null, tLeft: 0 },
    bot2: { q: null, tLeft: 0 },
    bot3: { q: null, tLeft: 0 },
  };

  let lastHudPush = 0;
  let lastResultText = "Ready";

  function resize() {
    dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();

    view.w = Math.max(1, Math.floor(rect.width));
    view.h = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    track = buildTrack(view.w, view.h);

    // IMPORTANT: do not overwrite this again
    trackHalfW = track.recommendedHalfW ?? clamp(Math.min(view.w, view.h) * 0.06, 36, 56);
  }

  function difficultyForCar(car) {
    // Keep difficulty mild so bots do not ramp into Terminator mode.
    const lapFactor = car.lap / (TOTAL_LAPS - 1 || 1);
    const timeFactor =
      phase === "race" ? clamp((nowMs() - raceStartMs) / 70000, 0, 1) : 0;

    return clamp(0.10 + lapFactor * 0.18 + timeFactor * 0.18, 0, 1);
  }

  function resetRace() {
    for (let i = 0; i < cars.length; i++) {
      cars[i].totalDist = 0;
      cars[i].speed = 0;
      cars[i].boost = 0;
      cars[i].lap = 0;
      cars[i].finished = false;
      cars[i].finishTime = 0;
    }

    streak = 0;
    lastResultText = "Go";

    // Easier start question
    playerQuestion = generateQuestion(0.0);
    playerQuestionStart = nowMs();
    cb.onQuestion(playerQuestion.text);

    for (const id of ["bot1", "bot2", "bot3"]) {
      botState[id].q = generateQuestion(0.0);
      botState[id].tLeft = nextBotTimeMs(id);
    }
  }

  function nextBotTimeMs(id) {
    const b = bots[id];
    const car = cars.find((c) => c.id === id);
    const diff = difficultyForCar(car);

    // Slower scaling than before
    const base = b.baseMs * (1 - diff * 0.08);
    return clamp(base + (Math.random() - 0.5) * b.jitter, 700, 3000);
  }

  function applyAnswerResult(car, isCorrect, elapsedMs, scale = 1.0) {
    // Base rolling speed
    const base = 74;

    if (isCorrect) {
      const t = clamp(elapsedMs, 250, 6000);

      // Player-friendly: smaller curve so bots do not skyrocket
      const bonus = 1100 / (t + 180); // lower than before
      car.boost += (38 + bonus * 56) * scale;
      car.boost = clamp(car.boost, 0, 260);
      lastResultText = `Correct (${Math.round(t)}ms)`;
    } else {
      // Wrong answer penalty
      car.boost *= 0.60;
      car.boost = Math.max(0, car.boost - 18);
      lastResultText = "Wrong";
    }

    car.speed = base + car.boost;
  }

  function updateCar(car, dt) {
    if (car.finished) return;

    // Boost decay
    car.boost *= Math.exp(-dt * 0.62);

    // Baseline speed rises gently over time
    const timeBoost =
      phase === "race" ? clamp((nowMs() - raceStartMs) / 90000, 0, 1) : 0;

    const base = 74 + timeBoost * 8;

    car.speed = base + car.boost;
    car.totalDist += car.speed * dt;

    const lap = Math.floor(car.totalDist / track.length);
    car.lap = lap;

    if (lap >= TOTAL_LAPS) {
      car.finished = true;
      car.finishTime = nowMs() - raceStartMs;
    }
  }

  function computePose(car) {
    const distOnLap = car.totalDist % track.length;
    const s = track.sampleAt(distOnLap);

    const laneOffset = (laneFracs[car.lane] || 0) * trackHalfW;
    const x = s.x + s.norX * laneOffset;
    const y = s.y + s.norY * laneOffset;

    const angle = Math.atan2(s.tanY, s.tanX);
    return { x, y, angle };
  }

  function standings() {
    return cars
      .slice()
      .sort((a, b) => b.totalDist - a.totalDist)
      .map((c) => {
        const pct = (c.totalDist % track.length) / track.length;
        const lapShown = Math.min(TOTAL_LAPS, c.lap + 1);
        return { id: c.id, name: c.name, pct, lap: lapShown };
      });
  }

  function placeOfPlayer() {
    const sorted = cars.slice().sort((a, b) => b.totalDist - a.totalDist);
    return sorted.findIndex((c) => c.id === "you") + 1;
  }

  function finishIfDone() {
    const finishedCount = cars.filter((c) => c.finished).length;
    if (finishedCount === cars.length) {
      phase = "finish";
      const sorted = cars.slice().sort((a, b) => a.finishTime - b.finishTime);
      cb.onFinish({
        winnerId: sorted[0].id,
        winnerName: sorted[0].name,
        order: sorted.map((c) => ({ id: c.id, name: c.name, timeMs: c.finishTime })),
      });
    }
  }

  function tickBots(dt) {
    for (const id of ["bot1", "bot2", "bot3"]) {
      const st = botState[id];
      const car = cars.find((c) => c.id === id);
      if (car.finished) continue;

      st.tLeft -= dt * 1000;
      if (st.tLeft <= 0) {
        const brain = bots[id];
        const diff = difficultyForCar(car);

        // Accuracy does NOT improve with difficulty; slightly worse if anything
        const acc = clamp(brain.accuracy - diff * 0.06, 0.62, 0.90);
        const correct = Math.random() < acc;

        // Slower human-ish reaction time
 const simulatedElapsed = clamp(
  brain.baseMs * (1 + diff * 0.05) + Math.random() * brain.jitter,
  650,
  3600
);

        // Bots get reduced boost
        applyAnswerResult(car, correct, simulatedElapsed, brain.boostScale);

        st.q = generateQuestion(diff * 0.35); // keep bot math easy too
        st.tLeft = nextBotTimeMs(id);
      }
    }
  }

  function pushHud() {
    const you = cars[0];
    const lapShown = Math.min(TOTAL_LAPS, you.lap + 1);

    cb.onHud({
      lap: lapShown,
      totalLaps: TOTAL_LAPS,
      place: placeOfPlayer(),
      speed: you.speed,
      streak,
      lastResult: lastResultText,
      standings: standings(),
    });
  }

  function submitAnswer(text) {
    if (phase !== "race") return;
    const you = cars[0];
    if (you.finished) return;

    const cleaned = String(text).trim();
    const val = Number(cleaned);

    const elapsed = nowMs() - playerQuestionStart;
    const isCorrect =
      Number.isFinite(val) && playerQuestion && val === playerQuestion.answer;

    if (isCorrect) streak += 1;
    else streak = 0;

    applyAnswerResult(you, isCorrect, elapsed, 1.0);

    // Keep player math easier by capping difficulty growth
    const diff = clamp(difficultyForCar(you) * 0.45, 0, 0.45);
    playerQuestion = generateQuestion(diff);
    playerQuestionStart = nowMs();
    cb.onQuestion(playerQuestion.text);
  }

  function assignUniqueColors(playerColor) {
    const picked = PALETTE.includes(playerColor) ? playerColor : PALETTE[0];
    cars[0].color = picked;

    const remaining = PALETTE.filter((c) => c !== picked);
    cars[1].color = remaining[0] || "#34c759";
    cars[2].color = remaining[1] || "#0a84ff";
    cars[3].color = remaining[2] || "#ffd60a";
  }

  function startRace({ playerColor }) {
    assignUniqueColors(playerColor);

    phase = "race";
    raceStartMs = nowMs();
    resetRace();
    pushHud();
  }

  function step(ts) {
    if (!running) return;

    if (!step.last) step.last = ts;
    const dtRaw = (ts - step.last) / 1000;
    const dt = clamp(dtRaw, 0, 0.033);
    step.last = ts;

    if (phase === "race") {
      tickBots(dt);
      for (const c of cars) updateCar(c, dt);
      finishIfDone();
    }

    const renderCars = cars.map((c) => {
      const pose = computePose(c);
      return { ...pose, id: c.id, name: c.name, color: c.color, totalDist: c.totalDist };
    });

    render(ctx, view, { track, cars: renderCars, trackHalfW });

    if (ts - lastHudPush > 120) {
      lastHudPush = ts;
      pushHud();
    }

    raf = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;

    resize();
    window.addEventListener("resize", resize);

    phase = "menu";
    raceStartMs = 0;
    resetRace();

    raf = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  }

  return { start, stop, startRace, submitAnswer };
}