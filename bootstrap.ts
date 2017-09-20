export interface ComponentMetadata {
    tag: string;
    template: string;
};

export interface ComponentCtor {
    new (...args): any;
}

export interface EventAttribute {
    event: string;
    expr: string;
}

function parseEventAttribute(attr: Attr): EventAttribute {
    const name = attr.name;
    if(name[0]=="(" && name[name.length-1]==")") {
        return {
            event: name.substring(1, name.length-1),
            expr: attr.value
        };
    }
}

function tryHandleEventAttribute(node: Node, attr: Attr, comp: any): boolean {
    const eventAttr = parseEventAttribute(attr);
    if(!eventAttr) {
        return false;
    }

    const f = new Function("return this." + eventAttr.expr);
    node.addEventListener(eventAttr.event, f.bind(comp));

    return true;
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

function compileText(childNode: Node, instructions: LinkInstruction[]) {
    const text = childNode.nodeValue;

    if(text[0]=="{" && text[1]=="{" && text[text.length-1]=="}" && text[text.length-2]=="}") {
        const expr = text.substring(2, text.length-2);

        const instruction = new InterpolationLinkInstruction(getElementId(childNode.parentElement), expr);
        addInstruction(instruction, instructions);
        return instruction;
        // watch(f, function(newValue) {
        //     childNode.nodeValue = newValue;
        // });
    }
}

function linkElementToComponent(element, comp) {
    for(let i=0; i<element.childNodes.length; i++) {
        const childNode = element.childNodes[i];

        if(childNode.nodeType == Node.ELEMENT_NODE) {
            console.log(childNode);

            for(let i=0; i<childNode.attributes.length; i++) {
                const attr = childNode.attributes[i];

                if(tryHandleEventAttribute(childNode, attr, comp)) {
                    continue;
                }
            }

            linkElementToComponent(childNode, comp);
        }
        else if(childNode.nodeType == Node.TEXT_NODE) {
            tryHandleInterpolationBinding(childNode, comp);

            console.log("Text: " + childNode.nodeValue);
        }
    }
}

abstract class LinkInstruction {
    abstract link(parent: Element, comp);
}

class EventBindingLinkInstruction extends LinkInstruction {
    constructor(public elementId: string, public eventName: string, public expr: Function) {
        super();
    }

    link(parent: Element, comp) {
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

    link(parent: Element, comp) {
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
    console.log("addInstruction", instruction, instructions);

    instructions.push(instruction);
}

function compileAttrAsEventBinding(element: Element, attr: Attr, instructions: LinkInstruction[]): LinkInstruction {
    const name = attr.name;
    if(name[0]=="(" && name[name.length-1]==")") {
        const elementId = getElementId(element);
        const eventName = name.substring(1, name.length-1);
        const instruction = new EventBindingLinkInstruction(elementId, eventName, compileExpr(attr.value))
        addInstruction(instruction, instructions);
        return instruction;
    }

    return null;
}

function compileAttr(element: Element, attr: Attr, instructions: LinkInstruction[]): LinkInstruction {
    console.log("compileAttr", element, attr);

    const instruction: LinkInstruction = compileAttrAsEventBinding(element, attr, instructions);
    if(instruction) {
        return instruction;
    }

    return null;

}

function compileElement(element: Element, instructions: LinkInstruction[]) {
    console.log("compileElement", element);

    for(let i=0; i<element.attributes.length; i++) {
        const attr = element.attributes[i];

        compileAttr(element, attr, instructions);
    }

    for(let i=0; i<element.childNodes.length; i++) {
        const childNode = element.childNodes[i];

        compileNode(childNode, instructions);
    }
}

function compileNode(node: Node, instructions: LinkInstruction[]) {
    console.log("compileNode", node);

    if(node.nodeType == Node.ELEMENT_NODE) {
        const element: Element = node as Element;

        compileElement(element, instructions);
    }
    else if(node.nodeType == Node.TEXT_NODE) {
        compileText(node, instructions);
    }
}

function linkComponent(instructions: LinkInstruction[], element: Element, comp: any) {
    for(let instruction of instructions) {
        instruction.link(element, comp);
    }
}

export function bootstrap(element: Element, compCtor: ComponentCtor) {
    const metadata: ComponentMetadata = compCtor["metadata"];

    const compElement = element.querySelector(metadata.tag);
    if(compElement) {
        const instructions: LinkInstruction[] = [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(metadata.template, "text/html");

        compileElement(doc.body, instructions);

        const compiledTemplate = doc.body.innerHTML;
        console.log(compiledTemplate);

        const comp = new compCtor();
        compElement.innerHTML = compiledTemplate;
        linkComponent(instructions, compElement, comp);
    }

    //linkElementToComponent(compElement, comp);

}
