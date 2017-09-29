import {ComponentMetadata} from "./annotations";
import {CompiledTemplate} from "./bootstrap";

export class TemplatesCollection {
    templates: {[refName: string]: CompiledTemplate};

    constructor() {
        this.templates = {};
    }

    add(refName: string, template: CompiledTemplate) {
        if(this.templates.hasOwnProperty(refName)) {
            throw new Error("Template with name: " + refName + " already exists");
        }

        this.templates[refName] = template;
    }
}

export class ComponentBase {
    static metadata: ComponentMetadata;

    element: Element;
    templates: TemplatesCollection;

    constructor() {
        this.templates = new TemplatesCollection();
    }
}
