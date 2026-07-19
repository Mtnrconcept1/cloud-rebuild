const symbols = Object.freeze([
  Object.freeze({
    id: "logo_suisse",
    label: "Logo TOK Suisse",
    src: "assets/tok.png"
  }),
  Object.freeze({
    id: "monstre_fourchette",
    label: "Monstre Fourchette",
    src: "assets/lacuillere.png"
  }),
  Object.freeze({
    id: "chef_tok",
    label: "Chef TOK",
    src: "assets/chef2.png"
  }),
  Object.freeze({
    id: "livreur",
    label: "Livreur",
    src: "assets/Livreur.png"
  }),
  Object.freeze({
    id: "logo_tok",
    label: "Logo TOK",
    src: "/logotok.png"
  }),
  Object.freeze({
    id: "bulle_miamz",
    label: "Bulle Miamz",
    src: "assets/mangez.png"
  })
]);

const serverSymbolAliases = Object.freeze({
  tok_suisse: "logo_suisse",
  fork: "monstre_fourchette",
  chef: "chef_tok",
  courier: "livreur",
  logo: "logo_tok",
  miamz: "bulle_miamz"
});

const symbolIndexById = new Map(
  symbols.map((symbol, index) => [symbol.id, index])
);
const reelEls = [
  document.getElementById("reel1"),
  document.getElementById("reel2"),
  document.getElementById("reel3")
];
const reelsWindow = document.getElementById("reelsWindow");
const slotMachine = document.getElementById("slotMachine");
const spinButton = document.getElementById("spinButton");
const lever = document.getElementById("lever");
const leverHandle = document.getElementById("leverHandle");
const message = document.getElementById("message");
const subMessage = document.getElementById("subMessage");
const attemptsEl = document.getElementById("attempts");
const winEl = document.getElementById("win");

const reelCycles = 10;
const safeCycle = 1;
const loopsBeforeResult = 3;
const baseSpinDuration = 1_350;
const spinDurationStep = 190;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let machineEnabled = false;
let spinning = false;
let positions = [0, 0, 0];
let resizeFrame = 0;
let activeSpinToken = 0;

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function getSymbolHeight() {
  return reelEls[0]?.parentElement?.getBoundingClientRect().height || 140;
}

function setReelTransform(reel, position, symbolHeight) {
  reel.style.transform = `translate3d(0, ${-position * symbolHeight}px, 0)`;
}

function createSymbol(symbol) {
  const item = document.createElement("div");
  const card = document.createElement("div");
  const image = document.createElement("img");

  item.className = "symbol";
  item.dataset.symbol = symbol.id;
  item.setAttribute("role", "img");
  item.setAttribute("aria-label", symbol.label);

  card.className = "symbol-card";
  image.src = symbol.src;
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");

  card.appendChild(image);
  item.appendChild(card);
  return item;
}

function buildReels() {
  reelEls.forEach((reel, reelIndex) => {
    const fragment = document.createDocumentFragment();

    for (let cycle = 0; cycle < reelCycles; cycle += 1) {
      for (const symbol of symbols) {
        fragment.appendChild(createSymbol(symbol));
      }
    }

    reel.replaceChildren(fragment);
    positions[reelIndex] =
      (safeCycle + reelIndex) * symbols.length + reelIndex;
  });

  layoutReels();
}

function layoutReels() {
  if (spinning) return;
  const symbolHeight = getSymbolHeight();

  reelEls.forEach((reel, index) => {
    setReelTransform(reel, positions[index], symbolHeight);
  });
}

function normalizeServerSymbol(symbolId) {
  return serverSymbolAliases[symbolId] || symbolId || "logo_tok";
}

function serverSymbolsToIndexes(serverSymbols) {
  const normalized = Array.isArray(serverSymbols)
    ? serverSymbols.slice(0, 3).map(normalizeServerSymbol)
    : ["logo_tok", "chef_tok", "bulle_miamz"];

  while (normalized.length < 3) normalized.push("logo_tok");

  return normalized.map((symbolId) => {
    const index = symbolIndexById.get(symbolId);
    return index === undefined
      ? symbolIndexById.get("logo_tok")
      : index;
  });
}

function setMachineEnabled(enabled) {
  machineEnabled = Boolean(enabled);
  spinButton.disabled = !machineEnabled;
  leverHandle.disabled = !machineEnabled;
}

function formatAttempts(payload) {
  const maxAttempts = Math.max(Number(payload.maxAttempts || 3), 1);
  const attemptsRemaining = Math.max(
    Math.min(Number(payload.attemptsRemaining || 0), maxAttempts),
    0
  );

  return {
    attemptsRemaining,
    maxAttempts,
    label: `${attemptsRemaining}/${maxAttempts}`
  };
}

function setAttempts(payload) {
  const attempts = formatAttempts(payload);
  attemptsEl.textContent = attempts.label;
  return attempts;
}

function postToParent(payload) {
  window.parent.postMessage(payload, window.location.origin);
}

function postSpinRequest() {
  if (spinning || !machineEnabled) return;

  spinning = true;
  setMachineEnabled(false);
  slotMachine.classList.remove("is-winning");
  lever.classList.add("is-pulled");
  winEl.textContent = "0";
  message.textContent = "TOK Spin";
  subMessage.textContent =
    "Tirage sécurisé — résultat calculé côté serveur TOK.";

  window.setTimeout(() => {
    lever.classList.remove("is-pulled");
  }, reducedMotion.matches ? 0 : 420);

  postToParent({ type: "TOK_SLOT_SPIN_REQUEST" });
}

function animateReel(
  reel,
  startPosition,
  targetPosition,
  symbolHeight,
  duration
) {
  const startTransform =
    `translate3d(0, ${-startPosition * symbolHeight}px, 0)`;
  const targetTransform =
    `translate3d(0, ${-targetPosition * symbolHeight}px, 0)`;

  reel.classList.add("is-spinning");
  reel.style.transform = startTransform;

  if (reducedMotion.matches || !reel.animate) {
    reel.style.transform = targetTransform;
    reel.classList.remove("is-spinning");
    return Promise.resolve();
  }

  const animation = reel.animate(
    [
      { transform: startTransform },
      { transform: targetTransform }
    ],
    {
      duration,
      easing: "cubic-bezier(.16,.72,.18,1)",
      fill: "forwards"
    }
  );

  return animation.finished
    .catch(() => undefined)
    .then(() => {
      reel.style.transform = targetTransform;
      animation.cancel();
      reel.classList.remove("is-spinning");
    });
}

function normalizeReelsToResults(results) {
  const symbolHeight = getSymbolHeight();

  reelEls.forEach((reel, index) => {
    const normalizedPosition =
      (safeCycle + index) * symbols.length + results[index];

    positions[index] = normalizedPosition;
    setReelTransform(reel, normalizedPosition, symbolHeight);
  });
}

function rainCoins(rewardPoints) {
  if (reducedMotion.matches || rewardPoints < 10) return;

  const count = rewardPoints >= 40 ? 18 : 9;

  for (let index = 0; index < count; index += 1) {
    const coin = document.createElement("span");
    const left = (index * 37 + 11) % 96;
    const drift = ((index * 53) % 140) - 70;
    const duration = 720 + (index % 5) * 95;

    coin.className = "coin";
    coin.style.left = `${left}vw`;
    coin.style.setProperty("--coin-drift", `${drift}px`);
    coin.style.setProperty("--fall-duration", `${duration}ms`);
    coin.addEventListener("animationend", () => coin.remove(), {
      once: true
    });

    document.body.appendChild(coin);
  }
}

function finishServerSpin(payload, results, spinToken) {
  if (spinToken !== activeSpinToken) return;

  normalizeReelsToResults(results);

  const rewardPoints = Math.max(Number(payload.rewardPoints || 0), 0);
  const totalPoints =
    typeof payload.totalPoints === "number"
      ? payload.totalPoints
      : null;
  const attempts = setAttempts(payload);

  winEl.textContent = rewardPoints > 0 ? `+${rewardPoints}` : "0";
  message.textContent =
    payload.rewardLabel ||
    (rewardPoints > 0 ? "Bravo TOK !" : "Tirage terminé");

  const balanceLabel =
    totalPoints === null ? "" : ` Solde : ${totalPoints} Miamz.`;
  const remainingLabel =
    attempts.attemptsRemaining > 0
      ? ` Il reste ${attempts.attemptsRemaining} essai${attempts.attemptsRemaining > 1 ? "s" : ""}.`
      : " C’était le dernier essai du jour.";

  subMessage.textContent =
    `+${rewardPoints} Miamz crédités.${balanceLabel}${remainingLabel}`;

  if (rewardPoints >= 4) {
    slotMachine.classList.add("is-winning");
    rainCoins(rewardPoints);
  }

  spinning = false;
  setMachineEnabled(attempts.attemptsRemaining > 0);

  postToParent({
    type: "TOK_SLOT_ANIMATION_COMPLETE",
    requestId:
      typeof payload.requestId === "string" ? payload.requestId : null
  });
}

function applyServerSpinResult(payload) {
  const results = serverSymbolsToIndexes(payload.symbols);
  const symbolHeight = getSymbolHeight();
  const spinToken = ++activeSpinToken;

  spinning = true;
  setMachineEnabled(false);

  const spinPromises = reelEls.map((reel, index) => {
    const currentPosition = positions[index];
    const currentSymbolIndex = positiveModulo(
      currentPosition,
      symbols.length
    );
    const resultIndex = results[index];
    const distanceToResult = positiveModulo(
      resultIndex - currentSymbolIndex,
      symbols.length
    );
    const targetPosition =
      currentPosition +
      (loopsBeforeResult + index) * symbols.length +
      distanceToResult;

    positions[index] = targetPosition;

    return animateReel(
      reel,
      currentPosition,
      targetPosition,
      symbolHeight,
      baseSpinDuration + index * spinDurationStep
    );
  });

  Promise.all(spinPromises).then(() => {
    finishServerSpin(payload, results, spinToken);
  });
}

function handleStatus(payload) {
  const attempts = setAttempts(payload);

  message.textContent = payload.message || "TOK Spin";
  subMessage.textContent = payload.subMessage || "";
  winEl.textContent = "0";

  if (payload.enabled || attempts.attemptsRemaining <= 0) {
    spinning = false;
  }

  setMachineEnabled(Boolean(payload.enabled) && !spinning);
}

function interceptSpin(event) {
  event?.preventDefault();
  postSpinRequest();
}

function interceptKeyboardSpin(event) {
  if (event.code !== "Space" && event.code !== "Enter") return;

  const activeElement = document.activeElement;
  const tag = activeElement?.tagName?.toLowerCase();
  const isInteractive =
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "summary" ||
    (tag === "button" && activeElement !== spinButton);

  if (!isInteractive) {
    event.preventDefault();
    postSpinRequest();
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window.parent) return;

  const payload = event.data || {};

  if (payload.type === "TOK_SLOT_SET_STATUS") {
    handleStatus(payload);
    return;
  }

  if (payload.type === "TOK_SLOT_SPIN_RESULT") {
    applyServerSpinResult(payload);
  }
});

spinButton.addEventListener("click", interceptSpin);
leverHandle.addEventListener("click", interceptSpin);
document.addEventListener("keydown", interceptKeyboardSpin);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(() => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(layoutReels);
  });
  resizeObserver.observe(reelsWindow);
} else {
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(layoutReels);
  }, { passive: true });
}

buildReels();
setAttempts({ attemptsRemaining: 0, maxAttempts: 3 });
winEl.textContent = "0";
postToParent({ type: "TOK_SLOT_FRAME_READY" });

