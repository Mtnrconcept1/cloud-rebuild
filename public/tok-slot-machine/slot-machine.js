const symbols = [
  {
    id: "logo_suisse",
    label: "Logo TOK Suisse",
    src: "assets/tok.png",
    srcCandidates: [
      "assets/logo-tok-suisse.png",
      "assets/logotok-suisse.png",
      "assets/logo_suisse.png",
      "assets/logosuisse.png",
      "assets/tok-suisse.png"
    ]
  },
  {
    id: "monstre_fourchette",
    label: "Monstre Fourchette",
    src: "assets/lacuillere.png",
    srcCandidates: [
      "assets/monstre-fourchette.png",
      "assets/monstre_fourchette.png",
      "assets/monstre.png",
      "assets/fourchette.png"
    ]
  },
  {
    id: "chef_tok",
    label: "Chef TOK",
    src: "assets/chef2.png",
    srcCandidates: [
      "assets/chef-tok.png",
      "assets/chef_tok.png",
      "assets/chef.png"
    ]
  },
  {
    id: "livreur",
    label: "Livreur",
    src: "assets/Livreur.png",
    srcCandidates: [
      "assets/livreur-tok.png",
      "assets/livreur_tok.png",
      "assets/cycliste.png",
      "assets/cycliste-tok.png",
      "assets/delivery.png",
      "assets/Livreur.png"
    ]
  },
  {
    id: "logo_tok",
    label: "Logo TOK",
    src: "/logotok.png",
    srcCandidates: [
      "assets/logo-tok.png",
      "assets/logo_tok.png"
    ]
  },
  {
    id: "bulle_miamz",
    label: "Bulle Miamz!",
    src: "assets/mangez.png",
    srcCandidates: [
      "assets/miamz.png",
      "assets/bulle-miamz.png",
      "assets/bulle_miamz.png",
      "assets/miamz-bulle.png"
    ]
  }
];

// Tableau des gains strict, dans l'ordre exact gauche → droite.
// Aucune autre combinaison ne paie. Une permutation des mêmes images ne paie pas.
const paytableRules = Object.freeze([
  Object.freeze({
    combo: Object.freeze(["logo_suisse", "logo_suisse", "logo_suisse"]),
    amount: 100,
    title: "Méga Jackpot TOK!",
    detail: "3× Logo TOK Suisse — +100 crédits",
    jackpot: true,
    weight: 1
  }),
  Object.freeze({
    combo: Object.freeze(["monstre_fourchette", "monstre_fourchette", "monstre_fourchette"]),
    amount: 60,
    title: "Jackpot Fourchette!",
    detail: "3× Monstre Fourchette — +60 crédits",
    jackpot: true,
    weight: 2
  }),
  Object.freeze({
    combo: Object.freeze(["chef_tok", "chef_tok", "chef_tok"]),
    amount: 45,
    title: "Jackpot Chef TOK!",
    detail: "3× Chef TOK — +45 crédits",
    jackpot: true,
    weight: 3
  }),
  Object.freeze({
    combo: Object.freeze(["livreur", "livreur", "livreur"]),
    amount: 40,
    title: "Jackpot Livreur!",
    detail: "3× Livreur — +40 crédits",
    jackpot: true,
    weight: 4
  }),
  Object.freeze({
    combo: Object.freeze(["logo_tok", "logo_tok", "logo_tok"]),
    amount: 30,
    title: "Jackpot Logo TOK!",
    detail: "3× Logo TOK — +30 crédits",
    jackpot: true,
    weight: 5
  }),
  Object.freeze({
    combo: Object.freeze(["bulle_miamz", "bulle_miamz", "bulle_miamz"]),
    amount: 24,
    title: "Jackpot Miamz!",
    detail: "3× Bulle Miamz! — +24 crédits",
    jackpot: true,
    weight: 6
  }),
  Object.freeze({
    combo: Object.freeze(["monstre_fourchette", "monstre_fourchette", "chef_tok"]),
    amount: 20,
    title: "Combo Fourchette!",
    detail: "2× Monstre Fourchette + 1× Chef TOK — +20 crédits",
    jackpot: false,
    weight: 8
  }),
  Object.freeze({
    combo: Object.freeze(["chef_tok", "chef_tok", "livreur"]),
    amount: 16,
    title: "Combo Chef!",
    detail: "2× Chef TOK + 1× Livreur — +16 crédits",
    jackpot: false,
    weight: 10
  }),
  Object.freeze({
    combo: Object.freeze(["livreur", "livreur", "monstre_fourchette"]),
    amount: 12,
    title: "Combo Livreur!",
    detail: "2× Livreur + 1× Monstre Fourchette — +12 crédits",
    jackpot: false,
    weight: 12
  }),
  Object.freeze({
    combo: Object.freeze(["logo_tok", "logo_tok", "monstre_fourchette"]),
    amount: 10,
    title: "Combo Logo!",
    detail: "2× Logo TOK + 1× Monstre Fourchette — +10 crédits",
    jackpot: false,
    weight: 14
  }),
  Object.freeze({
    combo: Object.freeze(["monstre_fourchette", "chef_tok", "livreur"]),
    amount: 8,
    title: "Combo Spécial!",
    detail: "1× Monstre Fourchette + 1× Chef TOK + 1× Livreur — +8 crédits",
    jackpot: false,
    weight: 16
  }),
  Object.freeze({
    combo: Object.freeze(["chef_tok", "logo_tok", "logo_tok"]),
    amount: 6,
    title: "Combo Chef Logo!",
    detail: "1× Chef TOK + 2× Logo TOK — +6 crédits",
    jackpot: false,
    weight: 18
  }),
  Object.freeze({
    combo: Object.freeze(["livreur", "logo_tok", "logo_tok"]),
    amount: 4,
    title: "Combo Livreur Logo!",
    detail: "1× Livreur + 2× Logo TOK — +4 crédits",
    jackpot: false,
    weight: 22
  }),
  Object.freeze({
    combo: Object.freeze(["monstre_fourchette", "logo_tok", "logo_tok"]),
    amount: 3,
    title: "Petit Combo TOK!",
    detail: "1× Monstre Fourchette + 2× Logo TOK — +3 crédits",
    jackpot: false,
    weight: 26
  })
]);

const symbolIndexById = new Map(symbols.map((symbol, index) => [symbol.id, index]));
const ruleKeySeparator = "|";
const strictPaytableByKey = new Map();

for (const rule of paytableRules) {
  const key = rule.combo.join(ruleKeySeparator);

  if (strictPaytableByKey.has(key)) {
    throw new Error(`Combinaison dupliquée dans le tableau des gains: ${key}`);
  }

  strictPaytableByKey.set(key, rule);
}

const reelCount = 3;
const loopsBeforeResult = 18;
const baseSpinDuration = 4600;
const spinDurationStep = 820;
const winningSpinProbability = 0.46;
const cyclesInStrip = 44;
const safeCycle = 12;
const stripLength = symbols.length * cyclesInStrip;

const reelEls = [
  document.getElementById("reel1"),
  document.getElementById("reel2"),
  document.getElementById("reel3")
];

const slotMachine = document.getElementById("slotMachine");
const spinButton = document.getElementById("spinButton");
const lever = document.getElementById("lever");
const leverHandle = document.getElementById("leverHandle");
const message = document.getElementById("message");
const subMessage = document.getElementById("subMessage");
const creditsEl = document.getElementById("credits");
const winEl = document.getElementById("win");

let credits = 15;
let spinning = false;
let positions = [0, 0, 0];
let lastResults = [0, 1, 2];

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function getSymbolHeight() {
  const sample = document.querySelector(".symbol");
  return sample ? sample.getBoundingClientRect().height : 180;
}

function setReelTransform(reel, position, symbolHeight) {
  reel.style.transform = `translate3d(0, ${-position * symbolHeight}px, 0)`;
}

function getSymbolSources(symbol) {
  const sources = [symbol.src, ...(symbol.srcCandidates || [])].filter(Boolean);
  return [...new Set(sources)];
}

function createSymbolImage(symbol, className, altText, ariaHidden = false) {
  const image = document.createElement("img");
  const sources = getSymbolSources(symbol);
  let sourceIndex = 0;

  image.className = className;
  image.alt = altText;
  image.draggable = false;

  if (ariaHidden) {
    image.setAttribute("aria-hidden", "true");
  }

  image.onerror = () => {
    sourceIndex += 1;

    if (sourceIndex < sources.length) {
      image.src = sources[sourceIndex];
      return;
    }

    image.onerror = null;
    image.style.display = "none";
  };

  image.src = sources[0];

  return image;
}

function createSymbol(symbol) {
  const item = document.createElement("div");
  item.className = "symbol";
  item.dataset.symbol = symbol.id;
  item.setAttribute("role", "img");
  item.setAttribute("aria-label", symbol.label);

  const card = document.createElement("div");
  card.className = "symbol-card";

  const image = createSymbolImage(symbol, "symbol-main", symbol.label);
  const ghost1 = createSymbolImage(symbol, "motion-ghost motion-ghost-1", "", true);
  const ghost2 = createSymbolImage(symbol, "motion-ghost motion-ghost-2", "", true);
  const ghost3 = createSymbolImage(symbol, "motion-ghost motion-ghost-3", "", true);

  card.appendChild(ghost3);
  card.appendChild(ghost2);
  card.appendChild(ghost1);
  card.appendChild(image);
  item.appendChild(card);

  return item;
}

function buildReels() {
  reelEls.forEach((reel) => {
    reel.innerHTML = "";

    for (let i = 0; i < stripLength; i += 1) {
      const symbol = symbols[i % symbols.length];
      reel.appendChild(createSymbol(symbol));
    }
  });

  randomizeStartPositions();
}

function randomizeStartPositions() {
  const symbolHeight = getSymbolHeight();

  reelEls.forEach((reel, index) => {
    const startSymbol = Math.floor(Math.random() * symbols.length);
    const start = (safeCycle + index) * symbols.length + startSymbol;

    positions[index] = start;
    lastResults[index] = startSymbol;

    reel.style.transition = "none";
    setReelTransform(reel, start, symbolHeight);
    reel.offsetHeight;
  });
}

function idsToIndexes(symbolIds) {
  return symbolIds.map((symbolId) => {
    const index = symbolIndexById.get(symbolId);

    if (index === undefined) {
      throw new Error(`Symbole inconnu dans le tableau des gains: ${symbolId}`);
    }

    return index;
  });
}

function indexesToIds(resultIndexes) {
  return resultIndexes.map((index) => symbols[index]?.id);
}

function getStrictRuleFromIds(resultIds) {
  return strictPaytableByKey.get(resultIds.join(ruleKeySeparator)) || null;
}

function getStrictRuleFromIndexes(resultIndexes) {
  return getStrictRuleFromIds(indexesToIds(resultIndexes));
}

function pickWeightedRule() {
  const totalWeight = paytableRules.reduce((total, rule) => total + rule.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (const rule of paytableRules) {
    cursor -= rule.weight;

    if (cursor <= 0) {
      return rule;
    }
  }

  return paytableRules[paytableRules.length - 1];
}

function buildAllStrictLosingResults() {
  const losingResults = [];

  for (let first = 0; first < symbols.length; first += 1) {
    for (let second = 0; second < symbols.length; second += 1) {
      for (let third = 0; third < symbols.length; third += 1) {
        const result = [first, second, third];

        if (!getStrictRuleFromIndexes(result)) {
          losingResults.push(result);
        }
      }
    }
  }

  return losingResults;
}

const strictLosingResults = Object.freeze(buildAllStrictLosingResults().map(Object.freeze));

function pickLosingResults() {
  const result = strictLosingResults[Math.floor(Math.random() * strictLosingResults.length)];
  return [...result];
}

function pickResults() {
  if (Math.random() < winningSpinProbability) {
    return idsToIndexes(pickWeightedRule().combo);
  }

  return pickLosingResults();
}

function calculateWin(resultIndexes) {
  const matchingRule = getStrictRuleFromIndexes(resultIndexes);

  if (matchingRule) {
    return {
      amount: matchingRule.amount,
      title: matchingRule.title,
      detail: matchingRule.detail,
      jackpot: matchingRule.jackpot
    };
  }

  return {
    amount: 0,
    title: "Retente ta chance",
    detail: "Combinaison non gagnante — 0 crédit.",
    jackpot: false
  };
}

function setMeters(winAmount) {
  creditsEl.textContent = credits;
  winEl.textContent = winAmount;
}

function setMachineEnabled(enabled) {
  spinButton.disabled = !enabled;
  spinButton.classList.toggle("is-down", !enabled);
}

function spin() {
  if (spinning) return;

  if (credits <= 0) {
    credits = 15;
    setMeters(0);
    message.textContent = "Rechargé!";
    subMessage.textContent = "15 nouveaux crédits pour relancer la machine.";
    return;
  }

  spinning = true;
  credits -= 1;

  setMeters(0);
  setMachineEnabled(false);

  slotMachine.classList.remove("is-winning");
  lever.classList.add("is-pulled");

  message.textContent = "TOK SPIN";
  subMessage.textContent = "Les rouleaux tournent — résultat exact du tableau.";

  window.setTimeout(() => {
    lever.classList.remove("is-pulled");
  }, 540);

  const results = pickResults();
  const symbolHeight = getSymbolHeight();

  const spinPromises = reelEls.map((reel, index) => {
    const currentPosition = positions[index];
    const currentSymbolIndex = positiveModulo(currentPosition, symbols.length);
    const resultIndex = results[index];
    const distanceToResult = positiveModulo(resultIndex - currentSymbolIndex, symbols.length);
    const targetPosition = currentPosition + (loopsBeforeResult + index * 2) * symbols.length + distanceToResult;

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
    finishSpin(results);
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOutQuint(t) {
  return t < 0.5
    ? 16 * t * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function resetReelMotion(reel) {
  const reelBox = reel.closest(".reel");

  if (reelBox) {
    reelBox.style.setProperty("--motion-ghost-opacity-1", "0");
    reelBox.style.setProperty("--motion-ghost-opacity-2", "0");
    reelBox.style.setProperty("--motion-ghost-opacity-3", "0");
    reelBox.style.setProperty("--motion-ghost-shift-1", "0px");
    reelBox.style.setProperty("--motion-ghost-shift-2", "0px");
    reelBox.style.setProperty("--motion-ghost-shift-3", "0px");
    reelBox.style.setProperty("--motion-stretch", "1");
    reelBox.style.setProperty("--motion-glow", "0");
  }
}

function applyReelMotion(reel, velocity, deltaY, progress) {
  const reelBox = reel.closest(".reel");

  if (!reelBox) return;

  const fadeIn = progress < 0.18
    ? clamp(progress / 0.18, 0, 1)
    : 1;

  const fadeOut = progress > 0.78
    ? clamp(1 - ((progress - 0.78) / 0.22), 0, 1)
    : 1;

  const motionAmount = fadeIn * fadeOut;
  const speed = clamp(velocity, 0, 5.6);
  const direction = deltaY < 0 ? 1 : -1;

  const shift1 = direction * clamp(speed * 3.2, 0, 18) * motionAmount;
  const shift2 = direction * clamp(speed * 6.4, 0, 34) * motionAmount;
  const shift3 = direction * clamp(speed * 10.5, 0, 56) * motionAmount;

  const opacity1 = clamp(speed * 0.052, 0, 0.26) * motionAmount;
  const opacity2 = clamp(speed * 0.034, 0, 0.17) * motionAmount;
  const opacity3 = clamp(speed * 0.021, 0, 0.10) * motionAmount;
  const stretch = 1 + (clamp(speed * 0.017, 0, 0.095) * motionAmount);
  const glow = clamp(speed * 0.085, 0, 0.36) * motionAmount;

  reelBox.style.setProperty("--motion-ghost-opacity-1", opacity1.toFixed(3));
  reelBox.style.setProperty("--motion-ghost-opacity-2", opacity2.toFixed(3));
  reelBox.style.setProperty("--motion-ghost-opacity-3", opacity3.toFixed(3));
  reelBox.style.setProperty("--motion-ghost-shift-1", `${shift1.toFixed(1)}px`);
  reelBox.style.setProperty("--motion-ghost-shift-2", `${shift2.toFixed(1)}px`);
  reelBox.style.setProperty("--motion-ghost-shift-3", `${shift3.toFixed(1)}px`);
  reelBox.style.setProperty("--motion-stretch", stretch.toFixed(3));
  reelBox.style.setProperty("--motion-glow", glow.toFixed(3));
}

function animateReel(reel, startPosition, targetPosition, symbolHeight, duration) {
  return new Promise((resolve) => {
    reel.classList.add("is-spinning");
    reel.style.transition = "none";

    const startY = -startPosition * symbolHeight;
    const targetY = -targetPosition * symbolHeight;
    const distanceY = targetY - startY;

    let startTime = null;
    let previousTime = null;
    let previousY = startY;

    resetReelMotion(reel);
    reel.style.transform = `translate3d(0, ${startY}px, 0)`;
    reel.offsetHeight;

    function frame(now) {
      if (startTime === null) {
        startTime = now;
        previousTime = now;
      }

      const elapsed = now - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const easedProgress = easeInOutQuint(progress);
      const currentY = startY + distanceY * easedProgress;
      const deltaTime = Math.max(now - previousTime, 16);
      const deltaY = currentY - previousY;
      const velocity = Math.abs(deltaY) / deltaTime;

      reel.style.transform = `translate3d(0, ${currentY}px, 0)`;
      applyReelMotion(reel, velocity, deltaY, progress);

      previousTime = now;
      previousY = currentY;

      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }

      reel.style.transition = "none";
      setReelTransform(reel, targetPosition, symbolHeight);
      resetReelMotion(reel);
      reel.classList.remove("is-spinning");
      resolve();
    }

    requestAnimationFrame(frame);
  });
}

function normalizeReelsToResults(results) {
  const symbolHeight = getSymbolHeight();

  reelEls.forEach((reel, index) => {
    const normalizedPosition = (safeCycle + index) * symbols.length + results[index];

    positions[index] = normalizedPosition;
    lastResults[index] = results[index];

    reel.style.transition = "none";
    setReelTransform(reel, normalizedPosition, symbolHeight);
    reel.offsetHeight;
  });
}

function finishSpin(results) {
  normalizeReelsToResults(results);

  const outcome = calculateWin(results);

  credits += outcome.amount;

  setMeters(outcome.amount);

  message.textContent = outcome.title;
  subMessage.textContent = outcome.detail;

  if (outcome.amount > 0) {
    slotMachine.classList.add("is-winning");
    rainCoins(outcome.jackpot ? 42 : 16);
  }

  spinning = false;
  setMachineEnabled(true);

  if (credits <= 0) {
    message.textContent = "Plus de crédits";
    subMessage.textContent = "Clique encore pour recharger la démo.";
  }
}

function rainCoins(count) {
  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement("span");

    coin.className = "coin";
    coin.style.left = `${Math.random() * 100}vw`;
    coin.style.top = `${-8 - Math.random() * 24}vh`;
    coin.style.setProperty("--coin-drift", `${-90 + Math.random() * 180}px`);
    coin.style.setProperty("--fall-duration", `${900 + Math.random() * 900}ms`);

    document.body.appendChild(coin);

    window.setTimeout(() => {
      coin.remove();
    }, 1900);
  }
}

function preloadAssets() {
  const uniqueSources = [...new Set(symbols.flatMap(getSymbolSources))];

  return Promise.all(
    uniqueSources.map((src) => {
      return new Promise((resolve) => {
        const image = new Image();

        image.onload = resolve;
        image.onerror = resolve;
        image.src = src;
      });
    })
  );
}

const serverSymbolAliases = Object.freeze({
  tok_suisse: "logo_suisse",
  fork: "monstre_fourchette",
  chef: "chef_tok",
  courier: "livreur",
  logo: "logo_tok",
  miamz: "bulle_miamz"
});

function normalizeServerSymbol(symbolId) {
  return serverSymbolAliases[symbolId] || symbolId || "logo_tok";
}

function serverSymbolsToIndexes(serverSymbols) {
  const normalizedSymbols = Array.isArray(serverSymbols)
    ? serverSymbols.slice(0, 3).map(normalizeServerSymbol)
    : ["logo_tok", "chef_tok", "bulle_miamz"];

  while (normalizedSymbols.length < 3) {
    normalizedSymbols.push("logo_tok");
  }

  return normalizedSymbols.map((symbolId) => {
    const index = symbolIndexById.get(symbolId);
    return index === undefined ? symbolIndexById.get("logo_tok") : index;
  });
}

function postSpinRequest() {
  if (spinning) return;

  spinning = true;
  setMachineEnabled(false);
  slotMachine.classList.remove("is-winning");
  lever.classList.add("is-pulled");
  message.textContent = "TOK SPIN";
  subMessage.textContent = "Tirage sécurisé — résultat calculé côté serveur TOK.";

  window.setTimeout(() => {
    lever.classList.remove("is-pulled");
  }, 540);

  window.parent.postMessage({ type: "TOK_SLOT_SPIN_REQUEST" }, window.location.origin);
}

function formatAttempts(payload) {
  const maxAttempts = Number(payload.maxAttempts || 3);
  const attemptsRemaining = Math.max(Number(payload.attemptsRemaining || 0), 0);

  return {
    attemptsRemaining,
    maxAttempts,
    label: `${attemptsRemaining}/${maxAttempts} essai${attemptsRemaining > 1 ? "s" : ""} restant${attemptsRemaining > 1 ? "s" : ""}`
  };
}

function interceptSpin(event) {
  if (event?.preventDefault) event.preventDefault();
  postSpinRequest();
}

function interceptKeyboardSpin(event) {
  if (event.code === "Space" || event.code === "Enter") {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag !== "input" && tag !== "textarea") {
      event.preventDefault();
      postSpinRequest();
    }
  }
}

function finishServerSpin(payload, results) {
  normalizeReelsToResults(results);

  const rewardPoints = Number(payload.rewardPoints || 0);
  const totalPoints = typeof payload.totalPoints === "number" ? payload.totalPoints : null;
  const attempts = formatAttempts(payload);

  if (totalPoints !== null) {
    credits = totalPoints;
  } else {
    credits += rewardPoints;
  }

  setMeters(rewardPoints);
  message.textContent = payload.rewardLabel || (rewardPoints > 0 ? "Bravo TOK!" : "Retente ta chance");
  subMessage.textContent = rewardPoints > 0
    ? `+${rewardPoints} Miamz crédités côté serveur. ${attempts.label}.`
    : `Tirage sécurisé côté serveur TOK. ${attempts.label}.`;

  if (rewardPoints > 0) {
    slotMachine.classList.add("is-winning");
    rainCoins(rewardPoints >= 40 ? 42 : 16);
  }

  spinning = false;
  setMachineEnabled(attempts.attemptsRemaining > 0);

  if (attempts.attemptsRemaining <= 0) {
    message.textContent = "Terminé pour aujourd'hui";
    subMessage.textContent = "Vos 3 essais du jour sont terminés. Revenez demain!";
  }
}

function applyServerSpinResult(payload) {
  const results = serverSymbolsToIndexes(payload.symbols);
  const symbolHeight = getSymbolHeight();

  const spinPromises = reelEls.map((reel, index) => {
    const currentPosition = positions[index];
    const currentSymbolIndex = positiveModulo(currentPosition, symbols.length);
    const resultIndex = results[index];
    const distanceToResult = positiveModulo(resultIndex - currentSymbolIndex, symbols.length);
    const targetPosition = currentPosition + (loopsBeforeResult + index * 2) * symbols.length + distanceToResult;

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
    finishServerSpin(payload, results);
  });
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const payload = event.data || {};

  if (payload.type === "TOK_SLOT_SET_STATUS") {
    message.textContent = payload.message || "TOK SPIN";
    subMessage.textContent = payload.subMessage || "";
    setMachineEnabled(Boolean(payload.enabled));
    spinning = !payload.enabled;
    if (typeof payload.attemptsRemaining === "number") {
      creditsEl.textContent = Math.max(Number(payload.attemptsRemaining), 0);
    }
    return;
  }

  if (payload.type === "TOK_SLOT_SPIN_RESULT") {
    applyServerSpinResult(payload);
  }
});

window.spin = postSpinRequest;

spinButton.addEventListener("click", interceptSpin);
leverHandle.addEventListener("click", interceptSpin);
document.addEventListener("keydown", interceptKeyboardSpin);

window.addEventListener("resize", () => {
  const symbolHeight = getSymbolHeight();

  reelEls.forEach((reel, index) => {
    reel.style.transition = "none";
    resetReelMotion(reel);
    setReelTransform(reel, positions[index], symbolHeight);
    reel.offsetHeight;
  });
});

preloadAssets().then(() => {
  buildReels();
  setMeters(0);
});
