import {Component, TextDecoration} from "../text";
import {HoverEvent} from "../text/style";
import {AbstractComponentRenderer} from "../text/renderer";
import {HtmlWriter} from "./writer";
import {HtmlStyle} from "./style";
import {Translations} from "../i18n";
import {TextComponent} from "../text/component/text";
import {TranslatableComponent} from "../text/component/translatable";
import {SelectorComponent} from "../text/component/selector";
import {KeybindComponent} from "../text/component/keybind";
import {ObjectComponent} from "../text/component/object";
import {DomEffects} from "./effects";
import {assertNever} from "../util/assertions";
import {KEYBIND_TO_LITERAL, KEYBIND_TO_TRANSLATABLE} from "../data/defaultKeybinds";

//

export class HtmlComponentRenderer extends AbstractComponentRenderer<HtmlWriter> {

    private static readonly HOVER_EVENT_RENDERER = (() => {
        const handlers = new HoverEvent.Handlers<{ writer: HtmlWriter, renderer: HtmlComponentRenderer }, void>();
        
        handlers.register(HoverEvent.Action.SHOW_TEXT, (event, { writer, renderer }) => {
            const inner = HtmlWriter.string();
            renderer.render(event.value(), inner);
            writer.property("data-mc-tooltip", inner.toString());
        });
        handlers.register(HoverEvent.Action.SHOW_ENTITY, (event, { writer, renderer }) => {
            const name = event.value().name();
            const inner = HtmlWriter.string();
            if (name !== null) {
                renderer.render(name, inner);
            } else {
                inner.openTag("span").content(event.value().type()).closeTag();
            }
            writer.property("data-mc-tooltip", inner.toString());
        });
        handlers.register(HoverEvent.Action.SHOW_ITEM, (event, { writer }) => {
            let text = event.value().item().asString();
            const count = event.value().count();
            if (count !== 1) text += ` x${count}`;
            writer.property("data-mc-tooltip", `<span>${text}</span>`);
        });
        return handlers;
    })();

    //

    private readonly _translations: Translations;
    
    constructor(translations: Translations) {
        super();
        this._translations = translations;
    }

    //

    protected renderText(component: TextComponent, writer: HtmlWriter): Component {
        this._open(component, writer);
        writer.content(component.content());
        this._close(component, writer);
        return component;
    }

    protected renderTranslatable(component: TranslatableComponent, writer: HtmlWriter): Component {
        const translated = this._translations.translate(component.key(), component.arguments());
        this.render(translated, writer);
        return translated;
    }

    protected renderSelector(component: SelectorComponent, writer: HtmlWriter): Component {
        this._open(component, writer);
        DomEffects.writeProperty(writer, "misc", component);
        writer.content(component.pattern());
        this._close(component, writer);
        return component;
    }

    protected renderKeybind(component: KeybindComponent, writer: HtmlWriter): Component {
        this._open(component, writer);
        DomEffects.writeProperty(writer, "misc", component);
        const key = component.keybind();
        writer.content(KEYBIND_TO_LITERAL[key] ?? KEYBIND_TO_TRANSLATABLE[key] ?? key);
        this._close(component, writer);
        return component;
    }

    protected renderObject(component: ObjectComponent, writer: HtmlWriter): Component {
        this._open(component, writer);

        const contents = component.contents();
        const contentsType = contents.type;
        switch (contentsType) {
            case "playerHead":
                DomEffects.writeProperty(writer, "player-head", contents);
                break;
            case "sprite":
                DomEffects.writeProperty(writer, "misc", component);
                break;
            default:
                assertNever(contentsType);
        }

        this._close(component, writer);
        return component;
    }

    protected renderBlock = this._renderMisc;
    protected renderEntity = this._renderMisc;
    protected renderStorage = this._renderMisc;
    protected renderScore = this._renderMisc;

    //

    private _renderMisc(component: Component, writer: HtmlWriter): Component {
        this._open(component, writer);
        DomEffects.writeProperty(writer, "misc", component);
        this._close(component, writer);
        return component;
    }

    private _open(component: Component, writer: HtmlWriter): void {
        writer.openTag("span");

        // Decorations
        let s: TextDecoration.State;
        s = component.decoration(TextDecoration.BOLD);
        if (s !== TextDecoration.State.NOT_SET) {
            writer.style(HtmlStyle.fontWeight(s === TextDecoration.State.TRUE ? "bold" : "normal"));
        }

        s = component.decoration(TextDecoration.ITALIC);
        if (s !== TextDecoration.State.NOT_SET) {
            writer.style(HtmlStyle.fontStyle(s === TextDecoration.State.TRUE ? "italic" : "normal"));
        }

        s = component.decoration(TextDecoration.OBFUSCATED);
        if (s !== TextDecoration.State.NOT_SET) {
            DomEffects.writeProperty(writer, "obfuscated", s === TextDecoration.State.TRUE);
        }

        const underlined = component.decoration(TextDecoration.UNDERLINED);
        const strikethrough = component.decoration(TextDecoration.STRIKETHROUGH);

        if (underlined !== TextDecoration.State.NOT_SET ||
            strikethrough !== TextDecoration.State.NOT_SET
        ) {
            writer.style(HtmlStyle.textDecoration(underlined, strikethrough));
        }

        // Color
        const color = component.color();
        if (color) writer.style(HtmlStyle.color(color.asHexString()));

        // Shadow Color
        const shadowColor = component.shadowColor();
        if (shadowColor) {
            writer.style(HtmlStyle.textShadow(shadowColor.asHexString()));
            DomEffects.writeProperty(writer, "shadow", shadowColor.asHexString());
        }

        // Hover Event
        const hover = component.hoverEvent();
        if (hover) HtmlComponentRenderer.HOVER_EVENT_RENDERER.invoke(hover, { writer, renderer: this });
    }

    private _close(component: Component, writer: HtmlWriter): void {
        for (const child of component.children()) {
            this.render(child, writer);
        }
        writer.closeTag();
    }

}

export namespace HtmlComponentRenderer {

    const INSTANCE = new HtmlComponentRenderer(Translations.empty());

    export function renderer(
        translations: Translations = Translations.empty()
    ): HtmlComponentRenderer {
        if (arguments.length === 0) return INSTANCE;
        return new HtmlComponentRenderer(translations);
    }
    
}
