import { Component, ComponentDecoration, IComponent } from "./spec";
import { StringBuilder } from "../util/string";
import { ColorTagResolver } from "../tag/impl/color";
import { bindObfuscatedText } from "../font/obf";
import { MiniMessageInstance, CreateElementFn } from "../spec";
import { renderDefaultKeybindHTML } from "../util/renderDefaultKeybind";
import { getHeadElement, intArrayToUUID } from "../util/renderHead";

// RegExp for language placeholders
const LANG_PLACEHOLDER_REGEX = /%(%|(?:(\d+)\$)?s)/g;

export function componentToHTML(
    context: MiniMessageInstance,
    component: Component,
    output?: HTMLElement,
    createElementFn?: CreateElementFn
): string {
    let doOutput = !!output;

    if (doOutput && !createElementFn) createElementFn = (n) => document.createElement(n);
    else if (!createElementFn) {
        // dummy HTMLElement for non-browser
        createElementFn = (() => ({
            innerText: "",
            style: {},
            setAttribute() {},
            appendChild() {}
        })) as unknown as CreateElementFn;
    }

    const sb = new StringBuilder();
    const runs: RenderRun[] = [];
    collectRuns(context, component, {}, runs);
    renderRuns(runs, sb, output!, createElementFn!);

    return sb.toString();
}

type RenderState = {
    color?: string;
    shadowColor?: number;
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;
    font?: string;
};

type RenderRun = {
    state: RenderState;
    text?: string;
    node?: HTMLElement; // sprite / head / image
};

function collectRuns(
    context: MiniMessageInstance,
    component: Component,
    parentState: RenderState,
    runs: RenderRun[]
) {
    const state = mergeState(parentState, extractState(component));

    // Text
    const text = component.getProperty("text");
    if (text) runs.push({ state, text });

    // Keybinds
    const keybind = component.getProperty("keybind");
    if (keybind) runs.push({ state, text: renderDefaultKeybindHTML(keybind, context) });

    // Translatable
    const translate = component.getProperty("translate");
    if (translate) {
        let substitutions = component.getProperty("with") ?? [];
        let translated: string = context.translations[translate] ?? "";

        translated = translated.replace(LANG_PLACEHOLDER_REGEX, (match, arg, num) => {
            if (arg === "%") return "%";
            let index = arg.length > 1 ? parseInt(num) - 1 : 0;
            return substitutions[index] ?? match;
        });

        if (translated) {
            const parsed = context.deserialize(translated);
            collectRuns(context, parsed, state, runs);
        }
    }

    // Extra children
    const extra = component.getProperty("extra");
    if (extra) {
        for (const child of extra) {
            if (typeof child === "string") {
                runs.push({ state, text: child });
            } else {
                collectRuns(context, new Component(child), state, runs);
            }
        }
    }

    // Player heads / sprites
    const head = component.getProperty("player");
    if (head) {
        const hat = component.getProperty("hat") ?? true;
        let identifier: string | undefined;

        if (typeof head === "string") identifier = head;
        else if ("id" in head) identifier = intArrayToUUID(head.id);
        else if ("texture" in head) identifier = head.texture;

        if (identifier) {
            const headEl = getHeadElement(identifier, hat);

            const color = state.color;
            if (color) {
                const mappedColor = ColorTagResolver.mapColor(color);
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = (headEl as HTMLImageElement).src;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d")!;
                    ctx.drawImage(img, 0, 0);
                    ctx.globalCompositeOperation = "multiply";
                    ctx.fillStyle = mappedColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    (headEl as HTMLImageElement).src = canvas.toDataURL();
                };
            }

            runs.push({ state, node: headEl });
        }
    }
}

function extractState(component: Component): RenderState {
    return {
        color: component.getProperty("color"),
        shadowColor: component.getProperty("shadowColor"),
        bold: component.getProperty("bold"),
        italic: component.getProperty("italic"),
        underlined: component.getProperty("underlined"),
        strikethrough: component.getProperty("strikethrough"),
        obfuscated: component.getProperty("obfuscated"),
        font: component.getProperty("font")
    };
}

function mergeState(parent: RenderState, child: RenderState): RenderState {
    return {
        color: child.color ?? parent.color,
        shadowColor: child.shadowColor ?? parent.shadowColor,

        bold: child.bold !== undefined ? child.bold : parent.bold,
        italic: child.italic !== undefined ? child.italic : parent.italic,
        underlined: child.underlined !== undefined ? child.underlined : parent.underlined,
        strikethrough: child.strikethrough !== undefined ? child.strikethrough : parent.strikethrough,
        obfuscated: child.obfuscated !== undefined ? child.obfuscated : parent.obfuscated,

        font: child.font ?? parent.font
    };
}

function renderRuns(
    runs: RenderRun[],
    sb: StringBuilder,
    output: HTMLElement,
    createElementFn: CreateElementFn
) {
    for (const run of runs) {
        const el = createElementFn("span");
        sb.appendLeftAngleBracket().appendString("span");

        let addedStyle = false;
        const addSpace = () => {
            if (!addedStyle) {
                sb.appendString(' style="');
                addedStyle = true;
            } else sb.appendSpace();
        };

        applyStyles(run.state, sb, el, addSpace);

        if (addedStyle) sb.appendString('"');
        sb.appendRightAngleBracket();

        if (run.text) {
            el.innerText = run.text;
            sb.appendString(run.text);
        } else if (run.node) {
            el.appendChild(run.node);
        }

        sb.appendString("</span>");
        if (output) {
            output.appendChild(el);

            if (run.state.obfuscated) {
                setTimeout(() => bindObfuscatedText(el, () => {}), 1);
            }
        }
    }
}

function applyStyles(state: RenderState, sb: StringBuilder, el: HTMLElement, addSpace: () => void) {
    if (state.color) {
        addSpace();
        const mapped = ColorTagResolver.mapColor(state.color);
        sb.appendString("color: ").appendString(mapped).appendSemicolon();
        el.style.color = mapped;
    }

    if (state.shadowColor !== undefined) {
        if (state.shadowColor === 0) {
            addSpace();
            sb.appendString("filter: none;");
            el.style.filter = "none";
        } else {
            const cssColor = shadowColorToCSS(state.shadowColor);
            addSpace();
            sb.appendString(`filter: drop-shadow(3px 3px ${cssColor})`);
            el.style.filter = `drop-shadow(3px 3px ${cssColor})`;
        }
    }

    const decorations: [keyof Pick<RenderState, "bold" | "italic" | "underlined" | "strikethrough">, string, keyof CSSStyleDeclaration, string][] = [
        ["bold", "font-weight: bold", "fontWeight", "bold"],
        ["italic", "font-style: italic", "fontStyle", "italic"],
        ["underlined", "text-decoration: underline", "textDecoration", "underline"],
        ["strikethrough", "text-decoration: line-through", "textDecoration", "line-through"]
    ];


    if (state.bold) {
        addSpace();
        sb.appendString("font-weigth: bold;");
        el.style.fontWeight = "bold";
    }

    if (state.italic) {
        addSpace();
        sb.appendString("font-style: italic;");
        el.style.fontStyle = "italic";
    }

    let textDecorations: string[] = [];
    if (state.underlined) textDecorations.push("underline");
    if (state.strikethrough) textDecorations.push("line-through");

    if (textDecorations.length > 0) {
        addSpace();
        const value = textDecorations.join(" ");
        sb.appendString(`text-decoration: ${value};`);
        el.style.textDecoration = value;
    }
}

function shadowColorToCSS(argb: number): string {
    const a = ((argb >>> 24) & 0xff) / 255;
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>> 8) & 0xff;
    const b = argb & 0xff;
    return `rgb(${r} ${g} ${b} / ${a})`;
}
