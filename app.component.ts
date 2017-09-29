import {CompiledTemplate, detectChanges, linkTemplate} from "./bootstrap";
import template from "./app.component.html";
import {Component, ComponentMetadata, ViewChild} from "./annotations";
import {ComponentBase} from "./component";

@Component({
    selector: "app-root",
    template: template,
})
export class AppComponent extends ComponentBase {
    counter: number = 12;
    @ViewChild("t1") template: CompiledTemplate;

    constructor() {
        super();

        console.log("AppComponent.ctor");
    }

    run() {
        console.log("run", this);

        ++this.counter;

        detectChanges();
    }

    linkTemplate() {
        linkTemplate(this.element.querySelector("#mark"), this.template);
    }
}
