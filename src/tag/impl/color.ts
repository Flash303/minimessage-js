import {Tag, TagResolver} from "../spec";
import {ArgumentQueue} from "../../markup/args";
import {TagResolverContext} from "../context";
import {Component} from "../../component/spec";

const COLOR_MAP: { [key: string]: string } = {
    "black": "#000000",
    "dark_blue": "#0000aa",
    "dark_green": "#00aa00",
    "dark_aqua": "#00aaaa",
    "dark_red": "#aa0000",
    "dark_purple": "#aa00aa",
    "gold": "#ffaa00",
    "gray": "#aaaaaa",
    "dark_gray": "#555555",
    "blue": "#5555ff",
    "green": "#55ff55",
    "aqua": "#55ffff",
    "red": "#ff5555",
    "light_purple": "#ff55ff",
    "yellow": "#ffff55",
    "white": "#ffffff"
};
COLOR_MAP["dark_grey"] = COLOR_MAP["dark_gray"];
COLOR_MAP["grey"] = COLOR_MAP["gray"];

export class ColorTagResolver implements TagResolver {

    static mapColor(name: string): string {
        if (name.length < 1) throw new Error("Color is an empty string");

        // Hex color
        if (name.charCodeAt(0) === 35) { // '#'
            const hex = name.substring(1);

            const value = parseInt(hex, 16);

            if (Number.isNaN(value)) {
                return "#ffffff";
            }

            const clamped = value & 0xFFFFFF;

            return "#" + clamped.toString(16).toUpperCase().padStart(6, "0");
        }

        const ret = COLOR_MAP[name];
        if (typeof ret === "undefined") return "#ffffff";
        return ret;
    }

    has(name: string): boolean {
        if (name === "color") return true;
        if (name in COLOR_MAP) return true;

        // Hex colors: #rgb or #rrggbb
        if (name.charCodeAt(0) !== 35) return false; // '#'

        if (name.length > 7) return false;

        for (let i = 1; i < name.length; i++) {
            const c = name.charCodeAt(i);

            // 0-9
            if (c >= 48 && c <= 57) continue;
            // A-F
            if (c >= 65 && c <= 70) continue;
            // a-f
            if (c >= 97 && c <= 102) continue;

            return false;
        }
        return true;
    }

    resolve(name: string, args: ArgumentQueue, ctx: TagResolverContext): Tag | null {
        let value: string = name;

        if (name === "color") {
            if (!args.hasNext()) return null;
            value = args.pop().lowerValue;
        }

        const mapped = ColorTagResolver.mapColor(value);

        return Tag.modify((component: Component) => {
            component.color = mapped;
        });
    }

}

export namespace ColorTagResolver {

    export const INSTANCE: TagResolver = new ColorTagResolver();

}
