import {ComponentMetadata} from "./annotations";

export interface ModuleMetadata {
    components: ComponentCtor[];
    bootstrap: ComponentCtor;
};

export interface ComponentCtor {
    new (...args): any;
    metadata: ComponentMetadata;
}

export interface ModuleCtor {
    metadata: ModuleMetadata;
    new (...args): any;
}

const watchers: Watcher[] = [];

interface WatcherListener {
    (newValue: any): void;
}

class Watcher {
    value: any;

    constructor(public func: ()=>any, public listener: WatcherListener) {
        this.value = func();
        listener(this.value);
    }

    check() {
        const val = this.func();
        if(val != this.value) {
            this.value = val;

            this.listener(this.value);
        }
    }
}

function watch(f: any, listener: WatcherListener) {
    watchers.push(new Watcher(f, listener));
}

export function detectChanges() {
    for(let watcher of watchers) {
        watcher.check();
    }
}

function tryHandleInterpolationBinding(childNode: Node, comp: any) {
    const text = childNode.nodeValue;

    if(text[0]=="{" && text[1]=="{" && text[text.length-1]=="}" && text[text.length-2]=="}") {
        const expr = text.substring(2, text.length-2);

        const f = new Function("return this." + expr).bind(comp);

        watch(f, function(newValue) {
            childNode.nodeValue = newValue;
        });
    }
}

function compileText(node: Node, compiledComponent: CompiledComponent) {
    const text = node.nodeValue;

    if(text[0]=="{" && text[1]=="{" && text[text.length-1]=="}" && text[text.length-2]=="}") {
        const expr = text.substring(2, text.length-2);

        const instruction = new InterpolationLinkInstruction(getElementId(node.parentElement), expr);
        compiledComponent.addInstruction(instruction);
        return instruction;
    }
}

abstract class LinkInstruction {
    abstract link(parent: Element, comp, compiledModule: CompiledModule);
}

class EventBindingLinkInstruction extends LinkInstruction {
    constructor(public elementId: string, public eventName: string, public expr: Function) {
        super();
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = parent.querySelector("[kissfx-id='" + this.elementId + "']");
        if(!element) {
            throw new Error("Can't find linked element");
        }

        element.addEventListener(this.eventName, this.expr.bind(comp));
    }
}

class InterpolationLinkInstruction extends LinkInstruction {
    public func: Function;

    constructor(public elementId: string, public expr: string) {
        super();

        this.func = new Function("return this." + expr);
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = parent.querySelector("[kissfx-id='" + this.elementId + "']");
        if(!element) {
            throw new Error("Can't find linked element");
        }

        const getter = this.func.bind(comp);

        watch(getter, function(newValue) {
            element["innerText"] = newValue;
        });
    }
}

class CreateComponentLinkInstruction extends LinkInstruction {
    constructor(public elementId: string, public tagName: string) {
        super();
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = parent.querySelector("[kissfx-id='" + this.elementId + "']");
        if(!element) {
            throw new Error("Can't find linked element");
        }

        const compiledComponent = compiledModule.getCompiledComponentByTagName(this.tagName);

        linkComponent(element, compiledComponent);
    }
}

let nextId = 1;

function generateId(): string {
    return (nextId++).toString();
}

function getElementId(element: Element) {
    let id = element.getAttribute("kissfx-id");
    if(!id) {
        id = generateId();
        element.setAttribute("kissfx-id", id);
    }

    return id;
}

function compileExpr(expr: string) {
    const f = new Function("return this." + expr);
    return f;
}

function addInstruction(instruction: LinkInstruction, instructions: LinkInstruction[]) {
    instructions.push(instruction);
}

function compileAttrAsEventBinding(element: Element, attr: Attr, compiledComponent: CompiledComponent): LinkInstruction {
    const name = attr.name;
    if(name[0]=="(" && name[name.length-1]==")") {
        const elementId = getElementId(element);
        const eventName = name.substring(1, name.length-1);
        const instruction = new EventBindingLinkInstruction(elementId, eventName, compileExpr(attr.value))
        compiledComponent.addInstruction(instruction);
        return instruction;
    }

    return null;
}

function compileAttr(element: Element, attr: Attr, compiledComponent: CompiledComponent): LinkInstruction {
    const instruction: LinkInstruction = compileAttrAsEventBinding(element, attr, compiledComponent);
    if(instruction) {
        return instruction;
    }

    return null;
}

function compileElement(element: Element, parent: CompiledComponent) {
    const tagName = element.tagName.toLowerCase();

    if(parent.module.componentWithTagNameExists(tagName)) {
        const instruction = new CreateComponentLinkInstruction(getElementId(element), tagName)
        parent.addInstruction(instruction);
    }
    else {
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];

            compileAttr(element, attr, parent);
        }

        for (let i = 0; i < element.childNodes.length; i++) {
            const childNode = element.childNodes[i];

            compileNode(childNode, parent);
        }
    }
}

function compileNode(node: Node, compiledComponent: CompiledComponent) {
    if(node.nodeType == Node.ELEMENT_NODE) {
        const element: Element = node as Element;

        compileElement(element, compiledComponent);
    }
    else if(node.nodeType == Node.TEXT_NODE) {
        compileText(node, compiledComponent);
    }
}

function linkComponent(element: Element, compiledComponent: CompiledComponent) {
    console.log("linkComponent", element, compiledComponent.compCtor.name);

    const comp = new compiledComponent.compCtor();
    element.innerHTML = compiledComponent.compiledDocument.body.innerHTML;
    for(let instruction of compiledComponent.instructions) {
        instruction.link(element, comp, compiledComponent.module);
    }
}

export class CompiledModule {
    compiledComponentByCtor: Map<ComponentCtor, CompiledComponent>;
    componentCtorByTagName: Map<string, ComponentCtor>;

    constructor(public moduleMetadata: ModuleMetadata) {
        this.compiledComponentByCtor = new Map<ComponentCtor, CompiledComponent>();
        this.componentCtorByTagName = new Map<string, ComponentCtor>();

        for(const compCtor of this.moduleMetadata.components) {
            this.componentCtorByTagName.set(compCtor.metadata.selector, compCtor);
        }
    }

    addComponent(compiledComp: CompiledComponent) {
        this.compiledComponentByCtor.set(compiledComp.compCtor, compiledComp);

        compiledComp.onAdded(this);
    }

    getCompiledComponentByCtor(compCtor: ComponentCtor): CompiledComponent {
        const compiledComponent = this.compiledComponentByCtor.get(compCtor);
        if(!compiledComponent) {
            throw new Error("No compiled component was found for ctor: " + compCtor.name);
        }

        return compiledComponent;
    }

    getCompiledComponentByTagName(tagName: string): CompiledComponent {
        const compCtor = this.componentCtorByTagName.get(tagName);
        if(!compCtor) {
            throw new Error("Component ctor for tagName: " + tagName + " was not found");
        }

        return this.getCompiledComponentByCtor(compCtor);
    }

    findComponentCtorByTagName(tagName: string): ComponentCtor {
        const compCtor = this.componentCtorByTagName.get(tagName);
        return compCtor;
    }

    componentWithTagNameExists(tagName: string): boolean {
        return !!this.findComponentCtorByTagName(tagName);
    }
}

export class CompiledComponent {
    public module: CompiledModule;
    public compMetadata: ComponentMetadata;
    public instructions: LinkInstruction[];
    public compiledDocument: Document;

    constructor(public compCtor: ComponentCtor) {
        this.instructions = [];

        this.compMetadata = compCtor.metadata;
        if(!this.compMetadata) {
            throw new Error("No component metadata");
        }

        const parser = new DOMParser();
        this.compiledDocument = parser.parseFromString(this.compMetadata.template, "text/html");
    }

    get tagName(): string {
        return this.compCtor.metadata.selector;
    }

    addInstruction(instruction: LinkInstruction) {
        this.instructions.push(instruction);
    }

    onAdded(compilationState: CompiledModule) {
        this.module = compilationState;
    }
}

function compileElementContent(element: Element, compiledComponent: CompiledComponent) {
    for(let i=0; i<element.childNodes.length; i++) {
        const childNode = element.childNodes[i];

        compileNode(childNode, compiledComponent);
    }
}

function compileComponent(compCtor: ComponentCtor, compilationState: CompiledModule) {
    console.log("compileComponent", compCtor.name);

    const compiledComp: CompiledComponent = new CompiledComponent(compCtor);
    compilationState.addComponent(compiledComp);

    compileElementContent(compiledComp.compiledDocument.body, compiledComp);
}

function compileModule(moduleCtor: ModuleCtor): CompiledModule {
    console.log("compileModule", moduleCtor.name);

    const moduleMetadata: ModuleMetadata = moduleCtor.metadata;
    if(!moduleMetadata) {
        throw new Error("No module metadata");
    }

    const compilationState = new CompiledModule(moduleMetadata);

    for(const compCtor of moduleMetadata.components) {
        compileComponent(compCtor, compilationState);
    }

    return compilationState;
}

export function bootstrap(element: Element, moduleCtor: ModuleCtor) {
    const compilationState = compileModule(moduleCtor);

    const moduleMetadata: ModuleMetadata = moduleCtor.metadata;
    if(!moduleMetadata) {
        throw new Error("No module metadata");
    }

    const compCtor = moduleMetadata.bootstrap;
    const compiledComponent = compilationState.getCompiledComponentByCtor(compCtor);

    const compElement = element.querySelector(compCtor.metadata.selector);
    if(!compElement) {
        throw new Error("Bootstrap element was not found");
    }

    linkComponent(compElement, compiledComponent);
}
