import { playerNameRegex, uuidRegex } from "./head";

export interface HeadProvider {
  name: string;
  supportsUsername: boolean;
  getUrl(identifier: string, size: number, showHat: boolean): string;
}

export const VzgeProvider: HeadProvider = {
  name: "vzge",
  supportsUsername: true,

  getUrl(identifier: string, size: number, showHat: boolean) {
    const base = `https://vzge.me/face/${size}/${identifier}`;
    return showHat ? base : `${base}?no=helmet`;
  }
};

export const CrafatarProvider: HeadProvider = {
  name: "crafatar",
  supportsUsername: false,

  getUrl(uuid: string, size: number, showHat: boolean) {
    return showHat
      ? `https://avatars.cloudhaven.gg/avatars/${uuid}?size=${size}`
      : `https://avatars.cloudhaven.gg/avatars/${uuid}?size=${size}&overlay`;
  }
};

export const McHeadsProvider: HeadProvider = {
  name: "mc-heads",
  supportsUsername: false,

  getUrl(uuid: string, size: number, showHat: boolean) {
    return showHat
      ? `https://mc-heads.net/avatar/${uuid}/${size}`
      : `https://mc-heads.net/avatar/${uuid}/${size}/nohelm`;
  }
};

export const HEAD_PROVIDERS: HeadProvider[] = [
  VzgeProvider,
  CrafatarProvider,
  McHeadsProvider
];
