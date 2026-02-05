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

const USERNAME_PROVIDERS = HEAD_PROVIDERS.filter(p => p.supportsUsername);
const UUID_ONLY_PROVIDERS = HEAD_PROVIDERS.filter(p => !p.supportsUsername);

const CACHE_EXPIRY_MS = 20 * 60 * 1000;

class LRUCache<K, V> {
  private maxSize: number;
  private map: Map<K, V>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value!;
      this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }


  has(key: K): boolean {
    return this.map.has(key);
  }
}

const HEAD_CACHE_LIMIT = 50;
const USERNAME_CACHE_LIMIT = 50;

const headCache = new LRUCache<string, HeadCacheEntry>(HEAD_CACHE_LIMIT);
const tintedCache = new LRUCache<string, string>(HEAD_CACHE_LIMIT); // cacheKey -> dataURL
const usernameCache = new LRUCache<string, string>(USERNAME_CACHE_LIMIT); // username -> uuid ("" = not found)
const fetchTimers = new Map<string, number>();

const REQUEST_QUEUE: (() => Promise<void>)[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || REQUEST_QUEUE.length === 0) return;
  isProcessingQueue = true;

  while (REQUEST_QUEUE.length > 0) {
    const task = REQUEST_QUEUE.shift()!;
    await task();
    await new Promise(r => setTimeout(r, 200));
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
  img.style.display = "inline-block";
  img.style.verticalAlign = "-7%";

  if (uuidRegex.test(identifier)) {
    renderUuidHead(identifier, img, showHat, size);
  } else if (playerNameRegex.test(identifier)) {
    renderUsernameHead(identifier, img, showHat, size);
  } else if (identifier.includes("/") || identifier.startsWith("minecraft:")) {
    setImageSource(img, textureSprite);
  } else {
    setImageSource(img, errorSprite);
  }

  return img;
}

function renderUuidHead(
  uuid: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number
) {
  const cacheKey = `${uuid}:${showHat}:${size}`;
  const cached = headCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    if (cached.state === "cached") {
      const reload = new Image();
      reload.onload = () => setImageSource(img, cached.file);
      reload.onerror = () => setImageSource(img, errorSprite);
      reload.src = cached.file;
    } else {
      setImageSource(img, cached.state === "error" ? errorSprite : spinnerAnimation);
    }
    return;
  }

  headCache.set(cacheKey, {
    state: "loading",
    file: spinnerAnimation,
    timestamp: Date.now()
  });

  setImageSource(img, spinnerAnimation);

  if (fetchTimers.has(cacheKey)) {
    clearTimeout(fetchTimers.get(cacheKey));
  }

  const timer = window.setTimeout(() => {
    queueRequest(async () => {
      tryProviderList(UUID_ONLY_PROVIDERS, uuid, img, showHat, size, cacheKey, 0);
    });
  }, 300);

  fetchTimers.set(cacheKey, timer);
}

function renderUsernameHead(
  username: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number
) {
  const cacheKey = `${username}:${showHat}:${size}:username`;

  setImageSource(img, spinnerAnimation);

  const cachedUuid = usernameCache.get(username);
  if (cachedUuid !== undefined) {
    if (cachedUuid === "") {
      setImageSource(img, notFoundSprite);
    } else {
      renderUuidHead(cachedUuid, img, showHat, size);
    }
    return;
  }

  if (USERNAME_PROVIDERS.length > 0) {
    queueRequest(async () => {
      tryProviderList(USERNAME_PROVIDERS, username, img, showHat, size, cacheKey, 0);
    });
    return;
  }

  if (fetchTimers.has(username)) {
    clearTimeout(fetchTimers.get(username));
  }

  const timer = window.setTimeout(() => {
    queueRequest(async () => {
      try {
        const res = await fetchWithRetry(`${ASHCON_API}${username}`);
        if (res.status === 404) {
          usernameCache.set(username, "");
          setImageSource(img, notFoundSprite);
          return;
        }

        const data = await res.json();
        const uuid = data.uuid;
        usernameCache.set(username, uuid);
        renderUuidHead(uuid, img, showHat, size);
      } catch (e) {
        console.warn(`[MiniMessage Renderer] Failed to resolve username ${username}`, e);
        setImageSource(img, errorSprite);
      }
    });
  }, 300);

  fetchTimers.set(username, timer);
}

function tryProviderList(
  providers: HeadProvider[],
  identifier: string,
  img: HTMLImageElement,
  showHat: boolean,
  size: number,
  cacheKey: string,
  index: number
) {
  if (index >= providers.length) {
    headCache.set(cacheKey, {
      state: "error",
      file: errorSprite,
      timestamp: Date.now()
    });
    setImageSource(img, errorSprite);
    return;
  }

  const provider = providers[index];
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
    setImageSource(img, url);
    console.info(`[MiniMessage Head Renderer] Loaded head via ${provider.name}`);
  };

  image.onerror = () => {
    console.warn(`[MiniMessage Head Renderer] ${provider.name} failed, trying fallback`);
    tryProviderList(providers, identifier, img, showHat, size, cacheKey, index + 1);
  };

  image.src = url;
}

const ASHCON_API = "https://api.ashcon.app/mojang/v2/user/";

async function fetchWithRetry(url: string, retries = 2, delay = 300): Promise<Response> {
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

function setImageSource(img: HTMLImageElement, src: string) {
  const tint = img.dataset.tintColor;
  const cacheKey = tint ? `${src}|${tint}` : src;

  if (tint && tintedCache.has(cacheKey)) {
    img.src = tintedCache.get(cacheKey)!;
    return;
  }

  if (!tint) {
    img.src = src;
    return;
  }

  tintImage(img, src, tint, cacheKey);
}

function tintImage(img: HTMLImageElement, textureUrl: string, tintColor: string, cacheKey: string) {
  if (img.dataset.tintApplied === "true") {
    img.src = textureUrl;
    return;
  }

  const base = new Image();
  base.crossOrigin = "anonymous";
  base.decoding = "async";
  base.src = textureUrl;

  base.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = base.naturalWidth || base.width;
      canvas.height = base.naturalHeight || base.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        img.src = textureUrl;
        return;
      }

      ctx.drawImage(base, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = tintColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(base, 0, 0);

      const dataUrl = canvas.toDataURL();
      tintedCache.set(cacheKey, dataUrl);
      img.dataset.tintApplied = "true";
      img.src = dataUrl;
    } catch {
      img.src = textureUrl;
    }
  };

  base.onerror = () => {
    img.src = textureUrl;
  };
}
