import { useState } from "react";

/* ---------------------------------- helpers ---------------------------------- */

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DENOMS = [10, 25, 50, 100, 250];
const CHIP_COLORS = {
  10: "#7a1f1f",
  25: "#1c5b8a",
  50: "#2f6b4f",
  100: "#1c1b17",
  250: "#C9A24B",
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildShoe(numDecks = 6) {
  const shoe = [];
  let id = 0;
  for (let d = 0; d < numDecks; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        shoe.push({ id: `${r}${s}-${d}-${id++}`, rank: r, suit: s });
      }
    }
  }
  return shuffle(shoe);
}

function draw(shoeArr) {
  let s = shoeArr;
  if (s.length < 10) s = buildShoe();
  const card = s[0];
  const rest = s.slice(1);
  return { card, rest };
}

function calcHandValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === "A") {
      total += 11;
      aces += 1;
    } else if (c.rank === "K" || c.rank === "Q" || c.rank === "J") {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }
  return { total, soft: softAces > 0 };
}

const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(2));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* ---------------------------------- pieces ---------------------------------- */

function PlayingCard({ card, faceDown, delay = 0 }) {
  const isRed = card && (card.suit === "♥" || card.suit === "♦");
  return (
    <div className="card-el" style={{ animationDelay: `${delay}ms` }}>
      {faceDown ? (
        <div className="card-back" />
      ) : (
        <div className="card-face" style={{ color: isRed ? "var(--crimson)" : "var(--ink)" }}>
          <div className="card-corner card-corner-top">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit-small">{card.suit}</span>
          </div>
          <div className="card-suit-big">{card.suit}</div>
          <div className="card-corner card-corner-bottom">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit-small">{card.suit}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ChipButton({ value, onClick, disabled }) {
  return (
    <button
      type="button"
      className="chip-btn"
      style={{ "--chip-color": CHIP_COLORS[value] }}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Bet $${value} chip`}
    >
      ${value}
    </button>
  );
}

function BetStack({ amount }) {
  if (!amount) return null;
  const count = Math.min(5, Math.max(1, Math.ceil(amount / 50)));
  const color =
    amount >= 250 ? "var(--gold)" : amount >= 100 ? "#1c1b17" : amount >= 50 ? "#2f6b4f" : amount >= 25 ? "#1c5b8a" : "#7a1f1f";
  return (
    <div className="bet-stack" aria-label={`Current bet $${fmt(amount)}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="chip-disc" style={{ bottom: `${i * 4}px`, background: color }} />
      ))}
      <span className="bet-amount">${fmt(amount)}</span>
    </div>
  );
}

function ResultBanner({ message }) {
  return (
    <div className="result-banner-group">
      {message.lines.map((l, i) => (
        <div key={i} className={`result-banner tone-${l.tone}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

export default function BlackjackTable() {
  const [shoe, setShoe] = useState(() => buildShoe());
  const [hands, setHands] = useState([]); // [{ cards, bet, status: 'active'|'stand'|'bust' }]
  const [activeHandIndex, setActiveHandIndex] = useState(0);
  const [dealerHand, setDealerHand] = useState([]);
  const [dealerHoleHidden, setDealerHoleHidden] = useState(true);
  const [dealerNote, setDealerNote] = useState(null);
  const [bankroll, setBankroll] = useState(1000);
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState("betting"); // betting | player | dealer | over
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeHand = hands[activeHandIndex] || null;
  const dTotal = dealerHand.length ? calcHandValue(dealerHand) : null;
  const totalWagered = hands.length ? hands.reduce((s, h) => s + h.bet, 0) : bet;

  const canSplit =
    hands.length === 1 &&
    activeHand &&
    activeHand.status === "active" &&
    activeHand.cards.length === 2 &&
    activeHand.cards[0].rank === activeHand.cards[1].rank &&
    bankroll >= activeHand.bet;

  function settleNatural(outcome, betAmount, text) {
    if (outcome === "blackjack") setBankroll((b) => b + betAmount * 2.5);
    else if (outcome === "push") setBankroll((b) => b + betAmount);
    setMessage({ lines: [{ text, tone: outcome }] });
    setPhase("over");
  }

  function settleHands(handsSnapshot, dealerVal) {
    let delta = 0;
    const lines = handsSnapshot.map((h, i) => {
      const label = handsSnapshot.length > 1 ? `Hand ${i + 1}: ` : "";
      if (h.status === "bust") {
        return { text: `${label}Bust — you went over 21`, tone: "lose" };
      }
      const hv = calcHandValue(h.cards);
      if (dealerVal.total > 21) {
        delta += h.bet * 2;
        return { text: `${label}Dealer busts — you win!`, tone: "win" };
      }
      if (hv.total > dealerVal.total) {
        delta += h.bet * 2;
        return { text: `${label}You win!`, tone: "win" };
      }
      if (hv.total < dealerVal.total) {
        return { text: `${label}Dealer wins`, tone: "lose" };
      }
      delta += h.bet;
      return { text: `${label}Push — it's a tie`, tone: "push" };
    });
    setBankroll((b) => b + delta);
    setMessage({ lines });
    setPhase("over");
  }

  async function runDealerForHands(handsSnapshot, shoeSnapshot) {
    let currentShoe = shoeSnapshot;
    let dHand = dealerHand;
    let dVal = calcHandValue(dHand);
    const allBust = handsSnapshot.every((h) => h.status === "bust");

    setDealerNote("Dealer reveals the hidden card…");
    await sleep(900);
    setDealerHoleHidden(false);
    await sleep(600);
    setDealerNote(`Dealer shows ${dVal.total}`);
    await sleep(1200);

    if (!allBust) {
      while (dVal.total < 17) {
        setDealerNote(`Dealer must draw — has ${dVal.total}`);
        await sleep(1000);
        const r = draw(currentShoe);
        currentShoe = r.rest;
        dHand = [...dHand, r.card];
        dVal = calcHandValue(dHand);
        setDealerHand(dHand);
        setShoe(currentShoe);
        setDealerNote(`Dealer draws the ${r.card.rank}${r.card.suit} — total is ${dVal.total}`);
        await sleep(1300);
      }

      setDealerNote(dVal.total > 21 ? `Dealer busts at ${dVal.total}` : `Dealer stands at ${dVal.total}`);
      await sleep(1200);
    }

    setDealerNote(null);
    settleHands(handsSnapshot, dVal);
  }

  async function moveToNextOrDealer(handsSnapshot, currentIdx, shoeSnapshot) {
    const nextIdx = handsSnapshot.findIndex((h, i) => i > currentIdx && h.status === "active");
    if (nextIdx !== -1) {
      setActiveHandIndex(nextIdx);
      return;
    }
    setPhase("dealer");
    await runDealerForHands(handsSnapshot, shoeSnapshot);
  }

  async function startRound() {
    if (bet <= 0 || bet > bankroll || busy) return;
    setMessage(null);
    setDealerNote(null);
    setBusy(true);
    let currentShoe = shoe;
    let r;
    let pCards = [];
    let dCards = [];
    r = draw(currentShoe); pCards = [r.card]; currentShoe = r.rest;
    r = draw(currentShoe); dCards = [r.card]; currentShoe = r.rest;
    r = draw(currentShoe); pCards = [...pCards, r.card]; currentShoe = r.rest;
    r = draw(currentShoe); dCards = [...dCards, r.card]; currentShoe = r.rest;

    const initialHand = { cards: pCards, bet, status: "active" };
    setShoe(currentShoe);
    setBankroll((b) => b - bet);
    setHands([initialHand]);
    setActiveHandIndex(0);
    setDealerHand(dCards);
    setDealerHoleHidden(true);
    setPhase("player");

    const pVal = calcHandValue(pCards);
    const dVal = calcHandValue(dCards);
    const pBJ = pVal.total === 21;
    const dBJ = dVal.total === 21;

    if (pBJ || dBJ) {
      await sleep(600);
      setDealerNote("Dealer checks for blackjack…");
      await sleep(900);
      setDealerHoleHidden(false);
      await sleep(500);
      setDealerNote(null);
      if (pBJ && dBJ) settleNatural("push", bet, "Push — both hold Blackjack");
      else if (pBJ) settleNatural("blackjack", bet, "Blackjack! You win 3:2");
      else settleNatural("lose", bet, "Dealer has Blackjack");
    }
    setBusy(false);
  }

  async function hit() {
    if (busy || phase !== "player") return;
    const idx = activeHandIndex;
    const hand = hands[idx];
    if (!hand || hand.status !== "active") return;
    setBusy(true);
    let currentShoe = shoe;
    const r = draw(currentShoe);
    currentShoe = r.rest;
    const newCards = [...hand.cards, r.card];
    const { total } = calcHandValue(newCards);
    let newStatus = "active";
    if (total > 21) newStatus = "bust";
    else if (total === 21) newStatus = "stand";

    const updatedHand = { ...hand, cards: newCards, status: newStatus };
    const updatedHands = hands.map((h, i) => (i === idx ? updatedHand : h));
    setShoe(currentShoe);
    setHands(updatedHands);

    if (newStatus !== "active") {
      await moveToNextOrDealer(updatedHands, idx, currentShoe);
    }
    setBusy(false);
  }

  async function stand() {
    if (busy || phase !== "player") return;
    const idx = activeHandIndex;
    const hand = hands[idx];
    if (!hand || hand.status !== "active") return;
    setBusy(true);
    const updatedHand = { ...hand, status: "stand" };
    const updatedHands = hands.map((h, i) => (i === idx ? updatedHand : h));
    setHands(updatedHands);
    await moveToNextOrDealer(updatedHands, idx, shoe);
    setBusy(false);
  }

  async function doubleDown() {
    if (busy || phase !== "player") return;
    const idx = activeHandIndex;
    const hand = hands[idx];
    if (!hand || hand.status !== "active" || hand.cards.length !== 2 || bankroll < hand.bet) return;
    setBusy(true);
    setBankroll((b) => b - hand.bet);
    let currentShoe = shoe;
    const r = draw(currentShoe);
    currentShoe = r.rest;
    const newCards = [...hand.cards, r.card];
    const { total } = calcHandValue(newCards);
    const newStatus = total > 21 ? "bust" : "stand";
    const updatedHand = { ...hand, cards: newCards, bet: hand.bet * 2, status: newStatus };
    const updatedHands = hands.map((h, i) => (i === idx ? updatedHand : h));
    setShoe(currentShoe);
    setHands(updatedHands);
    await moveToNextOrDealer(updatedHands, idx, currentShoe);
    setBusy(false);
  }

  async function splitHand() {
    if (busy || phase !== "player") return;
    const idx = activeHandIndex;
    const hand = hands[idx];
    if (!hand || hands.length > 1) return;
    if (hand.cards.length !== 2 || hand.cards[0].rank !== hand.cards[1].rank) return;
    if (bankroll < hand.bet) return;

    setBusy(true);
    setBankroll((b) => b - hand.bet);
    let currentShoe = shoe;
    const isAces = hand.cards[0].rank === "A";
    const cardA = hand.cards[0];
    const cardB = hand.cards[1];

    let r = draw(currentShoe); currentShoe = r.rest;
    const handA = { cards: [cardA, r.card], bet: hand.bet, status: "active" };
    r = draw(currentShoe); currentShoe = r.rest;
    const handB = { cards: [cardB, r.card], bet: hand.bet, status: "active" };

    if (isAces) {
      // Standard rule: split aces get exactly one card each, no further hitting.
      handA.status = "stand";
      handB.status = "stand";
    } else {
      if (calcHandValue(handA.cards).total === 21) handA.status = "stand";
      if (calcHandValue(handB.cards).total === 21) handB.status = "stand";
    }

    const newHands = [handA, handB];
    setShoe(currentShoe);
    setHands(newHands);

    if (handA.status === "active") {
      setActiveHandIndex(0);
      setBusy(false);
      return;
    }
    await moveToNextOrDealer(newHands, 0, currentShoe);
    setBusy(false);
  }

  function addChip(v) {
    if (phase !== "betting" || busy) return;
    setBet((b) => Math.min(b + v, bankroll));
  }

  function clearBet() {
    if (phase !== "betting" || busy) return;
    setBet(0);
  }

  function newRound() {
    setHands([]);
    setActiveHandIndex(0);
    setDealerHand([]);
    setDealerHoleHidden(true);
    setDealerNote(null);
    setMessage(null);
    setPhase("betting");
  }

  function reloadBankroll() {
    setBankroll(1000);
    setBet(0);
  }

  return (
    <div className="table-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap');

        .table-root {
          --felt: #0B3D2E;
          --felt-dark: #062018;
          --gold: #C9A24B;
          --gold-bright: #E8C874;
          --cream: #F3EEE1;
          --crimson: #A6291E;
          --ink: #1C1B17;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(12px, 3vw, 32px);
          background: radial-gradient(ellipse at center, #103f30 0%, var(--felt) 55%, var(--felt-dark) 100%);
          font-family: 'Manrope', sans-serif;
          box-sizing: border-box;
        }
        .table-root *, .table-root *::before, .table-root *::after { box-sizing: border-box; }

        .table-felt {
          position: relative;
          width: 100%;
          max-width: 760px;
          border-radius: 28px;
          border: 3px solid var(--gold);
          box-shadow: 0 0 0 8px rgba(0,0,0,0.35), 0 30px 60px rgba(0,0,0,0.5), inset 0 0 80px rgba(0,0,0,0.35);
          background: radial-gradient(ellipse at 50% 0%, #114f3b 0%, var(--felt) 60%, var(--felt-dark) 130%);
          padding: clamp(16px,3vw,28px) clamp(12px,3vw,28px) clamp(14px,2.5vw,24px);
          overflow: hidden;
        }

        .vignette {
          position: absolute; inset: 0; z-index: 0;
          background: radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(0,0,0,0.35) 100%);
          pointer-events: none;
        }

        .felt-content { position: relative; z-index: 1; display: flex; flex-direction: column; gap: clamp(8px, 1.6vw, 14px); }

        .table-arc { width: 100%; height: auto; display: block; margin-bottom: -14px; }
        .arc-text { font-family: 'Fraunces', serif; font-size: 15px; letter-spacing: 2px; fill: var(--gold); font-weight: 600; }

        .stat-row { display: flex; justify-content: space-between; padding: 0 6px; }
        .stat { display: flex; flex-direction: column; align-items: center; }
        .stat-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gold); opacity: 0.8; }
        .stat-value { font-family: 'Space Mono', monospace; font-size: clamp(16px,2.2vw,20px); color: var(--cream); }

        .zone-label {
          text-align: center; font-family: 'Fraunces', serif; letter-spacing: 2px; text-transform: uppercase;
          font-size: clamp(11px,1.6vw,13px); color: var(--gold-bright); opacity: 0.85; margin-bottom: 6px;
        }
        .hand-row { display: flex; justify-content: center; gap: 8px; min-height: clamp(76px,12vw,110px); flex-wrap: wrap; align-items: flex-start; }

        .hands-row { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
        .hand-block { display: flex; flex-direction: column; align-items: center; padding: 6px 12px; border-radius: 12px; transition: background 0.2s ease, box-shadow 0.2s ease; }
        .hand-active { background: rgba(201,162,75,0.12); box-shadow: 0 0 0 1px rgba(201,162,75,0.5) inset; }

        .center-zone { position: relative; min-height: clamp(52px,7vw,66px); display: flex; align-items: center; justify-content: center; }

        .dealer-note {
          font-family: 'Fraunces', serif; color: var(--gold-bright); font-size: clamp(12px,1.9vw,14.5px);
          letter-spacing: 0.4px; text-align: center; padding: 8px 18px; border-radius: 8px;
          background: rgba(6,32,24,0.55); animation: fadeUp 0.35s ease-out both;
        }

        .card-el { width: clamp(52px, 9vw, 78px); aspect-ratio: 2.5 / 3.5; animation: dealIn 0.45s ease-out both; }
        @keyframes dealIn {
          from { transform: translate(40px, -60px) rotate(12deg); opacity: 0; }
          to { transform: translate(0,0) rotate(0deg); opacity: 1; }
        }
        .card-face, .card-back { width: 100%; height: 100%; border-radius: 6px; position: relative; box-shadow: 0 3px 8px rgba(0,0,0,0.4); }
        .card-face { background: var(--cream); border: 1px solid rgba(0,0,0,0.15); }
        .card-back {
          background: repeating-linear-gradient(45deg, var(--felt) 0 6px, #0e4a37 6px 12px);
          border: 2px solid var(--gold);
        }
        .card-back::after { content: ''; position: absolute; inset: 14%; border: 1.5px solid var(--gold); border-radius: 4px; opacity: 0.6; }
        .card-corner { position: absolute; display: flex; flex-direction: column; align-items: center; line-height: 1; font-family: 'Fraunces', serif; }
        .card-corner-top { top: 4px; left: 5px; }
        .card-corner-bottom { bottom: 4px; right: 5px; transform: rotate(180deg); }
        .card-rank { font-size: clamp(11px,1.8vw,15px); font-weight: 700; }
        .card-suit-small { font-size: clamp(9px,1.4vw,12px); }
        .card-suit-big { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: clamp(22px,4vw,34px); opacity: 0.9; }

        .bet-stack { position: relative; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; }
        .chip-disc { position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 2px dashed rgba(243,238,225,0.6); box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
        .bet-amount { position: relative; z-index: 2; font-family: 'Space Mono', monospace; font-weight: 700; color: var(--cream); font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }

        .result-banner-group { display: flex; flex-direction: column; gap: 6px; align-items: center; }
        .result-banner {
          padding: 9px 20px; border-radius: 10px; border: 1.5px solid var(--gold);
          background: rgba(6,32,24,0.85); font-family: 'Fraunces', serif; font-size: clamp(13px,2vw,16px);
          text-align: center; color: var(--cream); animation: fadeUp 0.4s ease-out both; letter-spacing: 0.5px;
        }
        .result-banner.tone-win, .result-banner.tone-blackjack { color: var(--gold-bright); box-shadow: 0 0 24px rgba(232,200,116,0.35); }
        .result-banner.tone-lose { color: #e2a9a0; }
        .result-banner.tone-push { color: var(--cream); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .control-bar { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 4px; }
        .chip-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .chip-btn {
          width: 52px; height: 52px; border-radius: 50%; border: 3px dashed rgba(243,238,225,0.55);
          background: var(--chip-color); color: var(--cream); font-family: 'Space Mono', monospace; font-weight: 700;
          font-size: 12px; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: 0 3px 6px rgba(0,0,0,0.4);
        }
        .chip-btn:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.5); }
        .chip-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .action-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .btn {
          font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 0.5px;
          padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease; text-transform: uppercase;
        }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary { background: var(--gold); color: var(--ink); }
        .btn-primary:hover:not(:disabled) { background: var(--gold-bright); transform: translateY(-2px); }
        .btn-secondary { background: var(--cream); color: var(--ink); }
        .btn-secondary:hover:not(:disabled) { background: #fff; transform: translateY(-2px); }
        .btn-ghost { background: transparent; color: var(--cream); border: 1.5px solid rgba(243,238,225,0.5); }
        .btn-ghost:hover:not(:disabled) { border-color: var(--cream); }

        .btn:focus-visible, .chip-btn:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .card-el, .result-banner, .dealer-note { animation: none !important; }
        }
      `}</style>

      <div className="table-felt">
        <div className="vignette" />
        <div className="felt-content">
          <svg className="table-arc" viewBox="0 0 600 90" aria-hidden="true">
            <path id="arcPath" d="M 20 82 Q 300 -14 580 82" fill="none" />
            <text width="600">
              <textPath href="#arcPath" startOffset="50%" textAnchor="middle" className="arc-text">
                BLACKJACK PAYS 3 TO 2  •  DEALER MUST STAND ON ALL 17
              </textPath>
            </text>
          </svg>

          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Bankroll</span>
              <span className="stat-value">${fmt(bankroll)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Bet</span>
              <span className="stat-value">${fmt(totalWagered)}</span>
            </div>
          </div>

          <div className="dealer-zone">
            <div className="zone-label">
              Dealer{!dealerHoleHidden && dTotal ? ` · ${dTotal.total}` : ""}
            </div>
            <div className="hand-row">
              {dealerHand.map((c, i) => (
                <PlayingCard key={c.id} card={c} faceDown={i === 1 && dealerHoleHidden} delay={i * 150} />
              ))}
            </div>
          </div>

          <div className="center-zone">
            {phase === "dealer" && dealerNote ? (
              <div key={dealerNote} className="dealer-note">
                {dealerNote}
              </div>
            ) : phase === "over" && message ? (
              <ResultBanner message={message} />
            ) : (
              totalWagered > 0 && <BetStack amount={totalWagered} />
            )}
          </div>

          <div className="player-zone">
            <div className="hands-row">
              {hands.map((h, i) => {
                const hv = calcHandValue(h.cards);
                const isActive = phase === "player" && i === activeHandIndex;
                return (
                  <div key={i} className={`hand-block ${isActive ? "hand-active" : ""}`}>
                    <div className="zone-label">
                      {hands.length > 1 ? `Hand ${i + 1}` : "Player"} · {hv.total}
                      {hv.soft && hv.total < 21 ? " (soft)" : ""}
                      {h.status === "bust" ? " — Bust" : ""}
                      {hands.length > 1 && isActive ? " — your turn" : ""}
                    </div>
                    <div className="hand-row">
                      {h.cards.map((c, ci) => (
                        <PlayingCard key={c.id} card={c} delay={ci * 150} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {hands.length === 0 && (
                <div className="hand-block">
                  <div className="zone-label">Player</div>
                  <div className="hand-row" />
                </div>
              )}
            </div>
          </div>

          <div className="control-bar">
            {phase === "betting" && (
              <>
                <div className="chip-row">
                  {DENOMS.map((v) => (
                    <ChipButton key={v} value={v} onClick={() => addChip(v)} disabled={busy || bet + v > bankroll} />
                  ))}
                </div>
                <div className="action-row">
                  <button type="button" className="btn btn-ghost" onClick={clearBet} disabled={busy || bet === 0}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={startRound}
                    disabled={busy || bet === 0 || bet > bankroll}
                  >
                    Deal
                  </button>
                </div>
                {bankroll < 10 && (
                  <button type="button" className="btn btn-ghost" onClick={reloadBankroll}>
                    Reload $1000
                  </button>
                )}
              </>
            )}

            {phase === "player" && (
              <div className="action-row">
                <button type="button" className="btn btn-secondary" onClick={hit} disabled={busy}>
                  Hit
                </button>
                <button type="button" className="btn btn-secondary" onClick={stand} disabled={busy}>
                  Stand
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={doubleDown}
                  disabled={busy || !activeHand || activeHand.cards.length !== 2 || bankroll < activeHand.bet}
                >
                  Double Down
                </button>
                {canSplit && (
                  <button type="button" className="btn btn-secondary" onClick={splitHand} disabled={busy}>
                    Split
                  </button>
                )}
              </div>
            )}

            {phase === "dealer" && (
              <div className="action-row" style={{ visibility: "hidden" }} aria-hidden="true">
                <button type="button" className="btn btn-secondary">Hit</button>
                <button type="button" className="btn btn-secondary">Stand</button>
              </div>
            )}

            {phase === "over" && (
              <div className="action-row">
                <button type="button" className="btn btn-primary" onClick={newRound}>
                  Next Round
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
