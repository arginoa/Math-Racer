import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMathRaceEngine } from "../game/engine.js";

const COLORS = [
  { name: "Red", value: "#ff3b30" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#0a84ff" },
  { name: "Yellow", value: "#ffd60a" },
];

export default function MathRacer() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [phase, setPhase] = useState("menu"); // menu | race | finish
  const [playerColor, setPlayerColor] = useState(COLORS[0].value);

  const [question, setQuestion] = useState("Press Start");
  const [answer, setAnswer] = useState("");

  const [hud, setHud] = useState({
    lap: 1,
    totalLaps: 2,
    place: 1,
    speed: 0,
    streak: 0,
    lastResult: "Ready",
    standings: [],
  });

  const [results, setResults] = useState(null);

  const onQuestion = useCallback((qText) => {
    setQuestion(qText);
    setAnswer("");
  }, []);

  const onHud = useCallback((h) => {
    setHud(h);
  }, []);

  const onFinish = useCallback((r) => {
    setPhase("finish");
    setResults(r);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createMathRaceEngine(canvas, {
      onQuestion,
      onHud,
      onFinish,
    });

    engineRef.current = engine;
    engine.start();

    return () => engine.stop();
  }, [onQuestion, onHud, onFinish]);

  const startRace = useCallback(() => {
    setPhase("race");
    setResults(null);
    engineRef.current?.startRace({ playerColor });
  }, [playerColor]);

  const submit = useCallback(() => {
    if (phase !== "race") return;
    engineRef.current?.submitAnswer(answer);
    setAnswer("");
  }, [answer, phase]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") submit();
    },
    [submit]
  );

  const standingsList = useMemo(() => {
    return (hud.standings || []).map((s) => (
      <span key={s.id} className="pill">
        {s.name}: {s.lap}/{hud.totalLaps} ({Math.round(s.pct * 100)}%)
      </span>
    ));
  }, [hud.standings, hud.totalLaps]);

  return (
    <div className="wrap">
      <div className="stage">
        <canvas ref={canvasRef} />
      </div>

      <div className="ui">
        <div className="card">
          <div className="title">MATH RACER</div>
          <div className="row">
            <span className="pill">Lap: {hud.lap}/{hud.totalLaps}</span>
            <span className="pill">Place: {hud.place}/4</span>
            <span className="pill">Speed: {hud.speed.toFixed(1)}</span>
            <span className="pill">Streak: {hud.streak}</span>
            <span className="pill">Last: {hud.lastResult}</span>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            {standingsList}
          </div>

          <div className="question">
            <div className="qText">{question}</div>
            <div className="inputRow">
              <input
                className="answerInput"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={onKeyDown}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Type answer"
                disabled={phase !== "race"}
              />
              <button className="btn" onClick={submit} disabled={phase !== "race"}>
                OK
              </button>
            </div>
          </div>
        </div>
      </div>

      {phase !== "race" ? (
        <div className="overlay">
          <div className="panel">
            <h1 className="bigTitle">MATH RACER</h1>
            {phase === "menu" ? (
              <p className="sub">
                Answer math questions to accelerate. Faster correct answers give bigger boosts.
                Wrong answers slow you down. Two laps. Three bots.
              </p>
            ) : (
              <p className="sub">
                Race finished. Winner: <b>{results?.winnerName}</b>
              </p>
            )}

            <div className="title">Choose your car color</div>
            <div className="colorGrid">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  className="colorBtn"
                  onClick={() => setPlayerColor(c.value)}
                  style={{
                    borderColor: playerColor === c.value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.18)",
                  }}
                >
                  <span>{c.name}</span>
                  <span className="swatch" style={{ background: c.value }} />
                </button>
              ))}
            </div>

            <div className="row">
              {phase === "menu" ? (
                <button className="btn" onClick={startRace}>START RACE</button>
              ) : (
                <button className="btn" onClick={() => setPhase("menu")}>BACK TO MENU</button>
              )}
              {phase === "finish" ? (
                <button className="btn" onClick={startRace}>RACE AGAIN</button>
              ) : null}
            </div>

            <div className="smallNote">
              Tips: Press Enter to submit. For best view, set your zoom to 80%.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}