const games = new Map();

export const WORD_CATEGORIES = {
  animals: {
    label: "Animals",
    words: [
      "cat", "dog", "cow", "owl", "ant", "bee", "fox", "bat", "hen", "rat", "elk", "pig",
      "bear", "lion", "wolf", "deer", "duck", "frog", "goat", "crab", "fish", "seal",
      "tiger", "horse", "zebra", "sheep", "camel", "koala", "panda", "eagle", "snake", "mouse", "llama",
      "rabbit", "monkey", "donkey", "badger", "falcon", "turkey", "lizard",
      "dolphin", "giraffe", "hamster", "leopard", "penguin",
      "elephant", "crocodile", "kangaroo", "flamingo", "chipmunk",
    ],
  },
  food: {
    label: "Food",
    words: [
      "pie", "egg", "ham", "jam", "nut", "pea", "yam", "bun",
      "taco", "rice", "corn", "pear", "cake", "soup", "tofu", "oats", "plum", "mint",
      "bread", "pasta", "apple", "pizza", "mango", "lemon", "peach", "grape", "bacon", "salad",
      "burger", "noodle", "potato", "cookie", "muffin", "cheese", "tomato",
      "pancake", "sausage", "omelette", "spinach",
      "sandwich", "cupcake", "meatball",
    ],
  },
  fruits: {
    label: "Fruits",
    words: [
      "fig",
      "kiwi", "plum", "lime", "pear", "date",
      "apple", "mango", "lemon", "peach", "grape", "melon", "berry", "guava",
      "banana", "cherry", "orange", "papaya",
      "avocado", "coconut",
    ],
  },
  objects: {
    label: "Objects",
    words: [
      "key", "pen", "cup", "mug", "box", "can", "jar", "bed", "fan", "map", "hat",
      "desk", "lamp", "fork", "spoon", "plate", "phone", "clock", "chair",
      "pencil", "camera", "wallet", "bottle", "mirror", "laptop", "tablet",
      "blanket", "suitcase", "backpack", "keyboard",
      "umbrella", "flashlight",
    ],
  },
  nature: {
    label: "Nature",
    words: [
      "sky", "sun", "fog", "ice", "sea", "bay", "dew", "mud", "ash", "oak", "elm",
      "rain", "snow", "wind", "rock", "lake", "tree", "hill", "cave", "leaf",
      "forest", "flower", "ocean", "river", "cloud", "grass", "storm",
      "jungle", "desert", "mountain", "volcano",
      "waterfall", "rainforest",
    ],
  },
  sports: {
    label: "Sports",
    words: [
      "ski", "golf", "polo", "yoga", "race", "sumo",
      "rugby", "tennis", "soccer", "boxing", "hockey", "rowing",
      "cricket", "cycling", "karate", "baseball", "football", "swimming",
    ],
  },
  vehicles: {
    label: "Vehicles",
    words: [
      "car", "bus", "van", "jet",
      "bike", "truck", "train", "boat", "plane", "taxi", "ferry",
      "rocket", "subway", "scooter", "airplane",
    ],
  },
  places: {
    label: "Places",
    words: [
      "zoo", "inn", "dam",
      "park", "farm", "beach", "town", "city", "hotel",
      "museum", "school", "temple", "market",
      "airport", "station", "library",
      "hospital", "mountain",
    ],
  },
  professions: {
    label: "Professions",
    words: [
      "chef",
      "nurse", "pilot", "baker",
      "farmer", "teacher", "dentist", "plumber",
      "engineer",
    ],
  },
};

const DEFAULT_SETTINGS = {
  totalRounds: 10,
  minWordLength: 3,
  maxWordLength: 8,
  categories: Object.keys(WORD_CATEGORIES),
};

export const validateGameSettings = (settings = {}) => {
  if (
    settings === null ||
    typeof settings !== "object" ||
    Array.isArray(settings)
  ) {
    throw new Error("Invalid game settings.");
  }

  const totalRounds = Number(settings.totalRounds ?? DEFAULT_SETTINGS.totalRounds);
  const minWordLength = Number(settings.minWordLength ?? DEFAULT_SETTINGS.minWordLength);
  const maxWordLength = Number(settings.maxWordLength ?? DEFAULT_SETTINGS.maxWordLength);
  if (settings.categories !== undefined && !Array.isArray(settings.categories)) {
    throw new Error("Select at least one valid word category.");
  }
  const categories = settings.categories === undefined
    ? DEFAULT_SETTINGS.categories
    : [...new Set(settings.categories)];

  if (!Number.isInteger(totalRounds) || totalRounds < 3 || totalRounds > 10) {
    throw new Error("Choose between 3 and 10 rounds.");
  }

  if (
    !Number.isInteger(minWordLength) ||
    !Number.isInteger(maxWordLength) ||
    minWordLength < 3 ||
    maxWordLength > 8 ||
    minWordLength > maxWordLength
  ) {
    throw new Error("Choose a word length range between 3 and 8 letters.");
  }

  if (
    categories.length === 0 ||
    categories.some((category) => !Object.hasOwn(WORD_CATEGORIES, category))
  ) {
    throw new Error("Select at least one valid word category.");
  }

  return { totalRounds, minWordLength, maxWordLength, categories };
};

const getRandomWords = (settings, count = 3) => {
  const candidates = [
    ...new Set(
      settings.categories.flatMap((category) => WORD_CATEGORIES[category].words)
    ),
  ].filter(
    (word) =>
      word.length >= settings.minWordLength &&
      word.length <= settings.maxWordLength
  );

  if (candidates.length === 0) {
    throw new Error("No words match these categories and length. Adjust the game rules.");
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex],
      candidates[index],
    ];
  }

  return candidates.slice(0, count);
};

export const createGame = (roomCode, players, host = "", settings = {}) => {
  const gameSettings = validateGameSettings(settings);
  const game = {
    roomCode,
    host,
    settings: gameSettings,

    players: players.map((player) => ({
      username: player.username,
      socketId: player.socketId,
      score: player.score ?? 0,
    })),

    currentDrawerIndex: 0,

    currentWord: null,
    revealedCharacterCount: 0,
    wordOptions: getRandomWords(gameSettings),

    round: 1,
    totalRounds: gameSettings.totalRounds,

    timeLeft: 60,
    endsAt: null,
    result: null,

    status: "choosing-word",
  };

  games.set(roomCode, game);

  return game;
};

export const getGame = (roomCode) => {
  return games.get(roomCode);
};

export const deleteGame = (roomCode) => {
  games.delete(roomCode);
};

export const getCurrentDrawer = (game) => {
  return game?.players?.[game.currentDrawerIndex];
};

export const startNextRound = (roomCode) => {
  const game = games.get(roomCode);

  if (!game || game.status !== "round-over" || game.round >= game.totalRounds) {
    return null;
  }

  game.round += 1;
  game.currentDrawerIndex =
    (game.currentDrawerIndex + 1) % game.players.length;
  game.currentWord = null;
  game.revealedCharacterCount = 0;
  game.wordOptions = getRandomWords(game.settings);
  game.timeLeft = 60;
  game.endsAt = null;
  game.result = null;
  game.status = "choosing-word";

  return game;
};

export const selectWord = (roomCode, word) => {
  const game = games.get(roomCode);

  if (!game) {
    return null;
  }

  game.currentWord = word;
  game.revealedCharacterCount = 0;
  game.wordOptions = [];
  game.status = "playing";
  game.timeLeft = 60;
  game.endsAt = Date.now() + 60_000;
  game.result = null;

  games.set(roomCode, game);

  return game;
};

export const finishGame = (roomCode, winnerUsername, reason) => {
  const game = games.get(roomCode);

  if (!game?.currentWord || game.status !== "playing") {
    return null;
  }

  const winner = winnerUsername
    ? game.players.find((player) => player.username === winnerUsername)
    : null;

  if (winner) {
    winner.score += 1;
  }

  game.revealedCharacterCount = [...game.currentWord].filter(
    (character) => character !== " "
  ).length;
  game.timeLeft =
    reason === "time-up"
      ? 0
      : Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
  game.status = "round-over";
  game.result = {
    reason,
    word: game.currentWord,
    winner: winner?.username || null,
  };

  return game;
};

export const getGameWinners = (game) => {
  if (!game?.players?.length) {
    return [];
  }

  const highestScore = Math.max(...game.players.map((player) => player.score));

  return game.players
    .filter((player) => player.score === highestScore)
    .map(({ username, score }) => ({ username, score }));
};

export const getWordProgress = (game) => {
  if (!game?.currentWord) {
    return "";
  }

  let revealedCharacterCount = 0;

  return [...game.currentWord]
    .map((character) => {
      if (character === " ") {
        return character;
      }

      const isRevealed =
        revealedCharacterCount < game.revealedCharacterCount;
      revealedCharacterCount += 1;

      return isRevealed ? character : "_";
    })
    .join("");
};

export const revealNextCharacter = (roomCode) => {
  const game = games.get(roomCode);

  if (!game?.currentWord) {
    return null;
  }

  const characterCount = [...game.currentWord].filter(
    (character) => character !== " "
  ).length;

  if (game.revealedCharacterCount >= characterCount) {
    return null;
  }

  game.revealedCharacterCount += 1;
  return getWordProgress(game);
};
