import { Tag, TagResolver } from "../spec";
import { ArgumentQueue } from "../../markup/args";
import { TagResolverContext } from "../context";
import { Component } from "../../component/spec";
import { ColorTagResolver } from "./color";
import { ColorUtil } from "../../util/color";

export class ShadowTagResolver implements TagResolver {

    has(name: string): boolean {
        return name === "shadow" || name === "!shadow";
    }

    resolve(name: string, args: ArgumentQueue, ctx: TagResolverContext): Tag | null {

        // <!shadow> -> transparent shadow
        if (name === "!shadow") {
            return Tag.modify((component: Component) => {
                component.shadowColor = 0x00000000;
            });
        }

        if (!args.hasNext()) return null;

        let colorArg = args.pop().lowerValue;
        let alpha = 0.25;

        if (args.hasNext()) {
            const a = parseFloat(args.pop().lowerValue);
            if (!isNaN(a)) alpha = Math.min(1, Math.max(0, a));
        }

        if (colorArg.charCodeAt(0) !== 35) {
            colorArg = ColorTagResolver.mapColor(colorArg);
        }

        const [r, g, b] = ColorUtil.hex2RGB(colorArg);

        let a: number;

        // #RRGGBBAA overrides float alpha
        if (colorArg.length === 9) {
            a = parseInt(colorArg.substring(7, 9), 16);
        } else {
            a = Math.round(alpha * 255);
        }

        const shadowColor = ColorUtil.argbInt(r, g, b, a);

        return Tag.modify((component: Component) => {
            component.shadowColor = shadowColor >>> 0; // Force unsigned output for the cosmetics ✨
        });
    }
}

export namespace ShadowTagResolver {
    export const INSTANCE: TagResolver = new ShadowTagResolver();
}
