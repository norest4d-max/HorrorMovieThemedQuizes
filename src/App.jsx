import { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, Trophy, RotateCcw, Gamepad2, Volume2 } from 'lucide-react';
import { movies, questions } from './quizData';

const ROUND_LIMIT = 20;
const WRONG_LIMIT = 5;
const STORAGE_KEY = 'horror-quiz-memory-v1';

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveMemory(memory) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

function beep(type = 'correct') {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type === 'correct' ? 'square' : 'sawtooth';
  osc.frequency.value = type === 'correct' ? 880 : 140;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

function buildPool(selectedMovie, memory, level) {
  const source = selectedMovie === 'All Movies'
    ? questions
    : questions.filter((question) => question.movie === selectedMovie);

  const weighted = [];
  source.forEach((question) => {
    const record = memory[question.id] || { wrong: 0, correct: 0 };
    const difficultyBoost = question.difficulty <= level ? 1 : 0;
    const weight = 1 + record.wrong * 3 + difficultyBoost + Math.max(0, question.difficulty - 1);
    for (let i = 0; i < weight; i += 1) weighted.push(question);
  });
  return weighted;
}

function pickQuestion(selectedMovie, memory, level, usedIds) {
  const pool = buildPool(selectedMovie, memory, level).filter((question) => !usedIds.includes(question.id));
  const fallback = buildPool(selectedMovie, memory, level);
  const finalPool = pool.length ? pool : fallback;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export default function App() {
  const [selectedMovie, setSelectedMovie] = useState('All Movies');
  const [memory, setMemory] = useState(loadMemory);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(null);
  const [usedIds, setUsedIds] = useState([]);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(1);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [finished, setFinished] = useState(false);
  const tickRef = useRef(null);

  const choices = useMemo(() => current ? shuffle(current.choices) : [], [current?.id]);
  const accuracy = questionNumber ? Math.round((correct / questionNumber) * 100) : 0;

  useEffect(() => {
    saveMemory(memory);
  }, [memory]);

  useEffect(() => {
    if (!started || finished || status !== 'idle') return;
    tickRef.current = setInterval(() => {
      setSeconds((value) => value + 1);
      beep('tick');
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [started, finished, status, current?.id]);

  function begin(movie = selectedMovie) {
    const first = pickQuestion(movie, memory, 1, []);
    setSelectedMovie(movie);
    setStarted(true);
    setFinished(false);
    setCurrent(first);
    setUsedIds([first.id]);
    setQuestionNumber(1);
    setCorrect(0);
    setWrong(0);
    setStreak(0);
    setLevel(1);
    setSelected(null);
    setStatus('idle');
    setSeconds(0);
  }

  function answer(choice) {
    if (status !== 'idle') return;
    clearInterval(tickRef.current);
    const isRight = choice === current.answer;
    setSelected(choice);
    setStatus(isRight ? 'correct' : 'wrong');
    beep(isRight ? 'correct' : 'wrong');

    setMemory((old) => {
      const record = old[current.id] || { correct: 0, wrong: 0 };
      return {
        ...old,
        [current.id]: {
          correct: record.correct + (isRight ? 1 : 0),
          wrong: record.wrong + (isRight ? 0 : 1),
          lastMissed: !isRight
        }
      };
    });

    if (isRight) {
      const nextStreak = streak + 1;
      setCorrect((value) => value + 1);
      setStreak(nextStreak);
      if (nextStreak >= 3) setLevel((value) => Math.min(3, value + 1));
    } else {
      setWrong((value) => value + 1);
      setStreak(0);
    }
  }

  function next() {
    const newWrong = status === 'wrong' ? wrong + 0 : wrong;
    if (questionNumber >= ROUND_LIMIT || newWrong >= WRONG_LIMIT) {
      setFinished(true);
      setStatus('done');
      return;
    }
    const nextQuestion = pickQuestion(selectedMovie, memory, level, usedIds);
    setCurrent(nextQuestion);
    setUsedIds((ids) => [...ids, nextQuestion.id]);
    setQuestionNumber((value) => value + 1);
    setSelected(null);
    setStatus('idle');
    setSeconds(0);
  }

  const wrongLimitHit = wrong >= WRONG_LIMIT;

  return (
    <main className="app-shell">
      <section className="hero-card scanlines">
        <div className="hero-topline"><Skull size={18} /> HORROR VHS QUIZ SYSTEM</div>
        <h1>Black Paper White Horror Arcade</h1>
        <p>Pick one movie or run all five together. The game tracks misses, repeats weak questions more often, and levels up when your streak gets clean.</p>
      </section>

      {!started && (
        <section className="panel movie-select">
          <h2>Choose your tape</h2>
          <div className="movie-grid">
            {movies.map((movie) => (
              <button key={movie} className="movie-button" onClick={() => begin(movie)}>
                <Gamepad2 size={18} />
                {movie}
              </button>
            ))}
          </div>
          <p className="hint">All Movies = 20 mixed questions pulled from Chucky, Halloween, Scream, Midsommar, and Five Nights at Freddy's.</p>
        </section>
      )}

      {started && !finished && current && (
        <section className="game-grid">
          <aside className="score-card panel">
            <div><Trophy size={18} /> Scoreboard</div>
            <p>Correct: <strong>{correct}</strong></p>
            <p>Wrong: <strong>{wrong}/{WRONG_LIMIT}</strong></p>
            <p>Streak: <strong>{streak}</strong></p>
            <p>Difficulty: <strong>Level {level}</strong></p>
            <p>Accuracy: <strong>{accuracy}%</strong></p>
            <p>Question: <strong>{questionNumber}/{ROUND_LIMIT}</strong></p>
            <button className="secondary" onClick={() => begin(selectedMovie)}><RotateCcw size={16} /> Restart</button>
          </aside>

          <section className="question-card panel">
            <div className="question-meta">
              <span>{selectedMovie}</span>
              <span>{current.movie}</span>
              <span>Difficulty {current.difficulty}</span>
              <span className="timer">tick {seconds}s</span>
            </div>
            <h2>{current.q}</h2>
            <div className="choices">
              {choices.map((choice) => {
                const isAnswer = choice === current.answer;
                const isPicked = choice === selected;
                let className = 'choice';
                if (status !== 'idle' && isAnswer) className += ' right';
                if (status === 'wrong' && isPicked) className += ' wrong';
                return <button key={choice} className={className} onClick={() => answer(choice)}>{choice}</button>;
              })}
            </div>

            {status === 'correct' && <div className="feedback good"><Volume2 size={18} /> DING. Correct. Keep the streak alive.</div>}
            {status === 'wrong' && <div className="feedback bad"><Volume2 size={18} /> EHH. Right answer: <strong>{current.answer}</strong></div>}

            {status !== 'idle' && (
              <button className="next" onClick={next}>{questionNumber >= ROUND_LIMIT || wrongLimitHit ? 'Finish Run' : 'Next Question'}</button>
            )}
          </section>
        </section>
      )}

      {finished && (
        <section className="panel end-card">
          <h2>{wrongLimitHit ? 'Game Over: wrong limit hit' : 'Run Complete'}</h2>
          <p>You scored <strong>{correct}</strong> correct out of <strong>{questionNumber}</strong> answered.</p>
          <p>The algorithm saved your misses, so those weak questions will appear more often next run.</p>
          <div className="end-actions">
            <button className="next" onClick={() => begin(selectedMovie)}>Replay Same Mode</button>
            <button className="secondary" onClick={() => { setStarted(false); setFinished(false); }}>Pick Another Movie</button>
          </div>
        </section>
      )}
    </main>
  );
}
