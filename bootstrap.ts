import {ComponentMetadata, ComponentMetadataInternal} from "./annotations";
import {ComponentBase} from "./component";

export interface ModuleMetadata {
    components: ComponentCtor[];
    bootstrap: ComponentCtor;
};

export interface ComponentCtor {
    new (...args): any;
    metadata: ComponentMetadata;
}

export interface ModuleCtor {
    new (...args): any;
    metadata: ModuleMetadata;
}

class NodePosition {
    constructor(public path: number[]) {
    }

    child(index: number): NodePosition {
        return new NodePosition(this.path.concat([index]));
    }

    parent() {
        return new NodePosition(this.path.slice(0, this.path.length-1));
    }

    locate(scope: LinkScope) {
        let res;

        if(Array.isArray(scope)) {
            res = scope[this.path[0]];
        }
        else {
            res = scope.childNodes[this.path[0]];
        }

        for(let i=1; i<this.path.length; i++) {
            const index = this.path[i];

            res = res.childNodes[index] as Element;
        }

        return res;
    }
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

type CompiledScope = CompiledTemplate | CompiledComponent;

type LinkScope = Element | Node[];

function compileText(node: Node, nodePos: NodePosition, scope: CompiledScope) {
    const text = node.nodeValue;

    if(text[0]=="{" && text[1]=="{" && text[text.length-1]=="}" && text[text.length-2]=="}") {
        const expr = text.substring(2, text.length-2);

        const instruction = new InterpolationLinkInstruction(nodePos.parent(), expr);
        scope.addInstruction(instruction);
        return instruction;
    }
}

abstract class LinkInstruction {
    abstract link(scope: LinkScope, comp, compiledModule: CompiledModule);
}

class EventBindingLinkInstruction extends LinkInstruction {
    constructor(public elementPos: NodePosition, public eventName: string, public expr: Function) {
        super();
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = this.elementPos.locate(parent);
        if(!element) {
            throw new Error("Can't find linked element");
        }

        element.addEventListener(this.eventName, this.expr.bind(comp));
    }
}

class InterpolationLinkInstruction extends LinkInstruction {
    public func: Function;

    constructor(public elementPos: NodePosition, public expr: string) {
        super();

        this.func = new Function("return this." + expr);
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = this.elementPos.locate(parent);
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
    constructor(public elementPos: NodePosition, public tagName: string) {
        super();
    }

    link(parent: Element, comp, compiledModule: CompiledModule) {
        const element: Element = this.elementPos.locate(parent);
        if(!element) {
            throw new Error("Can't find linked element");
        }

        const compiledComponent = compiledModule.getCompiledComponentByTagName(this.tagName);

        linkComponent(element, compiledComponent);
    }
}

type ElementID = string;

function getElementById(parent: Element, elementId: ElementID) {
    const element: Element = parent.querySelector("[kissfx-id='" + this.elementId + "']");
    if(!element) {
        throw new Error("Can't find linked element");
    }

    return element;
}

class AddComponentRefLinkInstruction extends LinkInstruction {
    constructor(public elementPos: NodePosition, public refName: string, public template: CompiledTemplate) {
        super();
    }

    link(parent: Element, comp: ComponentBase, compiledModule: CompiledModule) {
        comp.templates.add(this.refName, this.template);
    }
}

let nextId = 1;

function generateId(): string {
    return (nextId++).toString();
}

// function getElementPosition(element: Element) {
//     let id = element.getAttribute("kissfx-id");
//     if(!id) {
//         id = generateId();
//         element.setAttribute("kissfx-id", id);
//     }
//
//     return id;
// }

function compileExpr(expr: string) {
    const f = new Function("return this." + expr);
    return f;
}

function compileAttrAsEventBinding(element: Element, elementPos: NodePosition, attr: Attr, compiledComponent: CompiledScope): LinkInstruction {
    const name = attr.name;
    if(name[0]=="(" && name[name.length-1]==")") {
        const eventName = name.substring(1, name.length-1);
        const instruction = new EventBindingLinkInstruction(elementPos, eventName, compileExpr(attr.value))
        compiledComponent.addInstruction(instruction);
        return instruction;
    }

    return null;
}

function compileAttr(element: Element, elementPos: NodePosition, attr: Attr, compiledComponent: CompiledScope): LinkInstruction {
    const instruction: LinkInstruction = compileAttrAsEventBinding(element, elementPos, attr, compiledComponent);
    if(instruction) {
        return instruction;
    }

    return null;
}

function compileTemplate(element: Element, elementPos: NodePosition, scope: CompiledScope, component: CompiledComponent) {
    element.parentElement.removeChild(element);

    const template = new CompiledTemplate(element);
    compileElementContent(element, new NodePosition([]), template, component);

    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];

        if(attr.name[0] == "#") {
            const refName = attr.name.substring(1);
            const instruction = new AddComponentRefLinkInstruction(elementPos, refName, template);

            component.templates[refName] = template;
        }

        compileAttr(element, elementPos, attr, component);
    }

    template.template = element.innerHTML;
}

function compileElement(element: Element, elementPos: NodePosition, scope: CompiledScope, component: CompiledComponent) {
    const tagName = element.tagName.toLowerCase();

    if(component.module.componentWithTagNameExists(tagName)) {
        const instruction = new CreateComponentLinkInstruction(elementPos, tagName)
        component.addInstruction(instruction);
    }
    else if(tagName == "ng-template") {
        compileTemplate(element, elementPos, scope, component);
    }
    else {
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];

            compileAttr(element, elementPos, attr, component);
        }

        for (let i = 0; i < element.childNodes.length; i++) {
            const childNode = element.childNodes[i];

            compileNode(childNode, elementPos.child(i), scope, component);
        }
    }
}

function compileNode(node: Node, nodePos: NodePosition, scope: CompiledScope, component: CompiledComponent) {
    if(node.nodeType == Node.ELEMENT_NODE) {
        const element: Element = node as Element;

        compileElement(element, nodePos, scope, component);
    }
    else if(node.nodeType == Node.TEXT_NODE) {
        compileText(node, nodePos, scope);
    }
}

export function linkTemplate(comp: ComponentBase, element: Element, compiledTemplate: CompiledTemplate) {
    const end = element.nextElementSibling;

    element.insertAdjacentHTML("afterend", compiledTemplate.template);

    const nodes: Node[] = [];

    let sib = element.nextSibling;
    while(sib!=null && sib!=end) {
        nodes.push(sib);

        sib = sib.nextSibling;
    }

    for(let instruction of compiledTemplate.instructions) {
        instruction.link(nodes, comp, compiledTemplate.module);
    }
}

function linkComponent(element: Element, compiledComponent: CompiledComponent) {
    console.log("linkComponent BEGIN", element, compiledComponent.compCtor.name);

    const comp: ComponentBase = new compiledComponent.compCtor();
    comp.element = element;
    element.innerHTML = compiledComponent.document.body.innerHTML;

    for(let instruction of compiledComponent.instructions) {
        instruction.link(element, comp, compiledComponent.module);
    }

    const metadata: ComponentMetadataInternal = compiledComponent.metadata;
    if(metadata.viewChildRequests) {
        for (let request of metadata.viewChildRequests) {
            comp[request.fieldName] = compiledComponent.templates[request.refName];
        }
    }

    console.log("linkComponent END", comp);
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
    module: CompiledModule;
    metadata: ComponentMetadataInternal;
    instructions: LinkInstruction[];
    document: Document;
    templates: {[refName: string]: CompiledTemplate};

    constructor(public compCtor: ComponentCtor) {
        this.instructions = [];
        this.templates = {};

        this.metadata = <ComponentMetadataInternal>compCtor.metadata;
        if(!this.metadata) {
            throw new Error("No component metadata");
        }

        const parser = new DOMParser();
        this.document = parser.parseFromString(this.metadata.template, "text/html");
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


export class CompiledTemplate {
    module: CompiledModule;
    instructions: LinkInstruction[];
    template: string;

    constructor(public element: Element) {
        this.instructions = [];
    }

    addInstruction(instruction: LinkInstruction) {
        this.instructions.push(instruction);
    }

    onAdded(compilationState: CompiledModule) {
        this.module = compilationState;
    }
}

function compileElementContent(element: Element, elementPos: NodePosition, scope: CompiledScope, component: CompiledComponent) {
    for(let i=0; i<element.childNodes.length; i++) {
        const childNode = element.childNodes[i];

        compileNode(childNode, elementPos.child(i), scope, component);
    }
}

function compileComponent(compCtor: ComponentCtor, compilationState: CompiledModule) {
    console.log("compileComponent", compCtor.name);

    const component: CompiledComponent = new CompiledComponent(compCtor);
    compilationState.addComponent(component);

    compileElementContent(component.document.body, new NodePosition([]), component, component);
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
