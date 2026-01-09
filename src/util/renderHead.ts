import {
  spinnerAnimation,
  errorSprite,
  notFoundSprite,
  textureSprite,
  uuidRegex,
  playerNameRegex
} from "../data/head";

import {
  HeadProvider,
  VzgeProvider,
  McHeadsProvider
} from "../data/headProviders";

interface HeadCacheEntry {
  state: "loading" | "cached" | "error";
  file: string;
  timestamp: number;
}

const HEAD_PROVIDERS: HeadProvider[] = [
  VzgeProvider,
  McHeadsProvider
];

const CACHE_EXPIRY_MS = 20 * 60 * 1000; // 20 minutes

const headCache = new Map<string, HeadCacheEntry>();
const usernameCache = new Map<string, string>(); // username -> uuid ("" = not found)
const fetchTimers = new Map<string, number>();

const REQUEST_QUEUE: (() => Promise<void>)[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || REQUEST_QUEUE.length === 0) return;
  isProcessingQueue = true;

  while (REQUEST_QUEUE.length > 0) {
    const task = REQUEST_QUEUE.shift()!;
    await task();
    await new Promise(r => setTimeout(r, 200)); // ~5 req/sec
  }

  isProcessingQueue = false;
}

function queueRequest(task: () => Promise<void>) {
  REQUEST_QUEUE.push(task);
  processQueue();
}

export function getHeadElement(
  identifier: string,
  showHat = true,
  size = 16
): HTMLImageElement {
  const img = document.createElement("img");

  img.style.width = "1em";
  img.style.height = "1em";
  img.style.imageRendering = "pixelated";

  if (uuidRegex.test(identifier)) {
    renderHead(identifier, img, showHat, size);
  } else if (playerNameRegex.test(identifier)) {
    renderUsernameHead(identifier, img, showHat, size);
  } else if (identifier.includes("/") || identifier.startsWith("minecraft:")) {
    img.src = textureSprite;
  } else {
    img.src = errorSprite;
  }

  return img;
}

function renderHead(
  identifier: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number
) {
  const cacheKey = `${identifier}:${showHat}:${size}`;
  const cached = headCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    img.src =
      cached.state === "cached"
        ? cached.file
        : cached.state === "error"
        ? errorSprite
        : spinnerAnimation;
    return;
  }

  headCache.set(cacheKey, {
    state: "loading",
    file: spinnerAnimation,
    timestamp: Date.now()
  });

  img.src = spinnerAnimation;

  if (fetchTimers.has(cacheKey)) {
    clearTimeout(fetchTimers.get(cacheKey));
  }

  const timer = window.setTimeout(() => {
    queueRequest(async () => {
      tryProviders(identifier, img, showHat, size, cacheKey, 0);
    });
  }, 300);

  fetchTimers.set(cacheKey, timer);
}

function tryProviders(
  identifier: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number,
  cacheKey: string,
  index: number
) {
  if (index >= HEAD_PROVIDERS.length) {
    headCache.set(cacheKey, {
      state: "error",
      file: errorSprite,
      timestamp: Date.now()
    });
    img.src = errorSprite;
    return;
  }

  const provider = HEAD_PROVIDERS[index];

  if (!provider.supportsUsername && !uuidRegex.test(identifier)) {
    tryProviders(identifier, img, showHat, size, cacheKey, index + 1);
    return;
  }

  const url = provider.getUrl(identifier, size, showHat);
  const image = new Image();

  image.decoding = "async";
  image.loading = "eager";
  image.style.imageRendering = "pixelated";

  image.onload = () => {
    headCache.set(cacheKey, {
      state: "cached",
      file: url,
      timestamp: Date.now()
    });
    img.src = url;

    console.info(
      `[MiniMessage Renderer] Loaded head via ${provider.name}`
    );
  };

  image.onerror = () => {
    console.warn(
      `[MiniMessage Renderer] ${provider.name} failed, trying fallback`
    );
    tryProviders(identifier, img, showHat, size, cacheKey, index + 1);
  };

  image.src = url;
}

const ASHCON_API = "https://api.ashcon.app/mojang/v2/user/";

function renderUsernameHead(
  username: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number
) {
  if (VzgeProvider.supportsUsername) {
    renderHead(username, img, showHat, size);
    return;
  }

  const cachedUuid = usernameCache.get(username);
  if (cachedUuid !== undefined) {
    if (cachedUuid === "") {
      img.src = notFoundSprite;
    } else {
      renderHead(cachedUuid, img, showHat, size);
    }
    return;
  }

  img.src = spinnerAnimation;

  if (fetchTimers.has(username)) {
    clearTimeout(fetchTimers.get(username));
  }

  const timer = window.setTimeout(() => {
    queueRequest(async () => {
      try {
        const res = await fetchWithRetry(`${ASHCON_API}${username}`);
        if (res.status === 404) {
          usernameCache.set(username, "");
          img.src = notFoundSprite;
          return;
        }

        const data = await res.json();
        const uuid = data.uuid;

        usernameCache.set(username, uuid);
        renderHead(uuid, img, showHat, size);
      } catch (e) {
        console.warn(
          `[MiniMessage Renderer] Failed to resolve username ${username}`,
          e
        );
        img.src = errorSprite;
      }
    });
  }, 300);

  fetchTimers.set(username, timer);
}

async function fetchWithRetry(
  url: string,
  retries = 2,
  delay = 300
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, { cache: "force-cache" });
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw new Error("Unreachable");
}

export function intArrayToUUID(ints: number[]): string {
  if (ints.length !== 4) return "";

  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  ints.forEach((v, i) => view.setInt32(i * 4, v));

  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) + "-" +
    hex.slice(8, 12) + "-" +
    hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" +
    hex.slice(20)
  );
}
