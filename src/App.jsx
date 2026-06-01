import { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, Trophy, RotateCcw, Gamepad2, Volume2, UserRound, Star, Brain } from 'lucide-react';
import { movies, questions } from './quizData';

const ROUND_LIMIT = 20;
const WRONG_LIMIT = 5;
const STORAGE_KEY = 'horror-quiz-memory-v1';
const PROFILE_KEY = 'horror-quiz-temp-profile-v1';

const defaultProfile = {
  username: 'Guest Slayer #013',
  xp: 0,
  rank: 'Tape Rookie',
  reviews: [
    { movie: 'Hereditary', rating: 5, text: 'Slow dread, family trauma, and one of the darkest third acts in modern horror.' },
    { movie: 'Scream', rating: 5, text: 'A smart slasher that tests whether you understand horror rules while breaking them.' },
    { movie: 'Midsommar', rating: 4, text: 'Bright daylight horror that feels like a breakup, a cult study, and a nightmare at once.' }
  ]
};

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getRank(xp) {
  if (xp >= 2000) return 'Final Boss Scholar';
  if (xp >= 1200) return 'Plot Demon';
  if (xp >= 650) return 'Lore Hunter';
  if (xp >= 300) return 'VHS Detective';
  return 'Tape Rookie';
}

function createAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  return new AudioContext();
}

function playTone(ctx, type = 'correct') {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'correct') {
    osc.type = 'square';
    osc.frequency.value = 880;
  } else if (type === 'wrong') {
    osc.type = 'sawtooth';
    osc.frequency.value = 140;
  } else {
    osc.type = 'triangle';
    osc.frequency.value = 420;
  }

  const length = type === 'tick' ? 0.05 : 0.2;
  const volume = type === 'tick' ? 0.025 : 0.08;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
  osc.start();
  osc.stop(ctx.currentTime + length + 0.02);
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

function getMovieStats(movie, memory) {
  const source = movie === 'All Movies' ? questions : questions.filter((question) => question.movie === movie);
  const totals = source.reduce((acc, question) => {
    const record = memory[question.id] || { correct: 0, wrong: 0 };
    acc.correct += record.correct || 0;
    acc.wrong += record.wrong || 0;
    return acc;
  }, { correct: 0, wrong: 0 });
  const attempts = totals.correct + totals.wrong;
  const iq = attempts ? Math.round((totals.correct / attempts) * 100) : 0;
  return { ...totals, attempts, iq };
}

export default function App() {
  const [selectedMovie, setSelectedMovie] = useState('All Movies');
  const [memory, setMemory] = useState(() => loadJson(STORAGE_KEY, {}));
  const [profile, setProfile] = useState(() => loadJson(PROFILE_KEY, defaultProfile));
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
  const [soundReady, setSoundReady] = useState(false);
  const audioRef = useRef(null);
  const tickRef = useRef(null);

  const choices = useMemo(() => current ? shuffle(current.choices) : [], [current?.id]);
  const accuracy = questionNumber ? Math.round((correct / questionNumber) * 100) : 0;
  const movieStats = getMovieStats(selectedMovie, memory);
  const xpToNext = 300 - (profile.xp % 300);

  useEffect(() => saveJson(STORAGE_KEY, memory), [memory]);
  useEffect(() => saveJson(PROFILE_KEY, profile), [profile]);

  useEffect(() => {
    if (!started || finished || status !== 'idle') return;
    tickRef.current = setInterval(() => {
      setSeconds((value) => value + 1);
      playTone(audioRef.current, 'tick');
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [started, finished, status, current?.id]);

  function unlockSound() {
    if (!audioRef.current) audioRef.current = createAudio();
    if (audioRef.current?.state === 'suspended') audioRef.current.resume();
    playTone(audioRef.current, 'correct');
    setSoundReady(true);
  }

  function begin(movie = selectedMovie) {
    if (!soundReady) unlockSound();
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
    const gainedXp = isRight ? 10 + current.difficulty * 5 + streak * 2 : 0;
    setSelected(choice);
    setStatus(isRight ? 'correct' : 'wrong');
    playTone(audioRef.current, isRight ? 'correct' : 'wrong');

    setMemory((old) => {
      const record = old[current.id] || { correct: 0, wrong: 0 };
      return {
        ...old,
        [current.id]: {
          correct: record.correct + (isRight ? 1 : 0),
          wrong: record.wrong + (isRight ? 0 : 1),
          lastMissed: !isRight,
          movie: current.movie
        }
      };
    });

    if (isRight) {
      const nextStreak = streak + 1;
      setCorrect((value) => value + 1);
      setStreak(nextStreak);
      setProfile((old) => {
        const nextXp = old.xp + gainedXp;
        return { ...old, xp: nextXp, rank: getRank(nextXp) };
      });
      if (nextStreak >= 3) setLevel((value) => Math.min(3, value + 1));
    } else {
      setWrong((value) => value + 1);
      setStreak(0);
    }
  }

  function next() {
    if (questionNumber >= ROUND_LIMIT || wrong >= WRONG_LIMIT) {
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
        <div className="account-strip">
          <div><UserRound size={18} /> Signed in as <strong>{profile.username}</strong></div>
          <div>Rank: <strong>{profile.rank}</strong></div>
          <div>XP: <strong>{profile.xp}</strong></div>
        </div>
        <h1>Black Paper White Horror Arcade</h1>
        <p>Pick one movie or run all movies together. Correct answers reward XP, streaks raise difficulty, and your Movie IQ grows by how well you know each tape.</p>
        <button className="sound-button" onClick={unlockSound}><Volume2 size={16} /> {soundReady ? 'Mobile Sound Ready' : 'Tap to Unlock Mobile Sound'}</button>
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
          <p className="hint">All Movies = 20 mixed questions. Missed questions are weighted higher until your knowledge gets cleaner.</p>
        </section>
      )}

      {started && !finished && current && (
        <section className="game-grid">
          <aside className="score-card panel">
            <div><Trophy size={18} /> Player Card</div>
            <p>Correct: <strong>{correct}</strong></p>
            <p>Wrong: <strong>{wrong}/{WRONG_LIMIT}</strong></p>
            <p>Streak: <strong>{streak}</strong></p>
            <p>Difficulty: <strong>Level {level}</strong></p>
            <p>Accuracy: <strong>{accuracy}%</strong></p>
            <p>Question: <strong>{questionNumber}/{ROUND_LIMIT}</strong></p>
            <p>XP to next badge: <strong>{xpToNext}</strong></p>
            <p>Movie IQ: <strong>{movieStats.iq}</strong></p>
            <p>Movie attempts: <strong>{movieStats.attempts}</strong></p>
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

            {status === 'correct' && <div className="feedback good"><Brain size={18} /> DING. +XP earned. Your {current.movie} IQ is developing.</div>}
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
          <p>XP total: <strong>{profile.xp}</strong> · Rank: <strong>{profile.rank}</strong> · Movie IQ: <strong>{movieStats.iq}</strong></p>
          <p>The algorithm saved your misses, so those weak questions will appear more often next run.</p>
          <div className="end-actions">
            <button className="next" onClick={() => begin(selectedMovie)}>Replay Same Mode</button>
            <button className="secondary" onClick={() => { setStarted(false); setFinished(false); }}>Pick Another Movie</button>
          </div>
        </section>
      )}

      <section className="panel reviews-panel">
        <div className="section-title"><Star size={18} /> Movie Review Notes</div>
        <p className="hint">Temporary account reviews. Later this can become a full review form saved to localStorage.</p>
        <div className="review-grid">
          {profile.reviews.map((review) => (
            <article className="review-card" key={review.movie}>
              <h3>{review.movie}</h3>
              <div className="stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
              <p>{review.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
