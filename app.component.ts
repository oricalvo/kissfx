import {detectChanges} from "./bootstrap";
import template from "./app.component.html";
import {Component, ComponentMetadata} from "./annotations";

@Component({
    selector: "app-root",
    template: template,
})
export class AppComponent {
    counter: number = 12;

    constructor() {
        console.log("AppComponent.ctor");
    }

    run() {
        console.log("run", this);

        ++this.counter;

        detectChanges();
    }
}
