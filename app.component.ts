import {ComponentMetadata, detectChanges} from "./bootstrap";
import template from "./app.component.html";

export class AppComponent {
    static metadata: ComponentMetadata = {
        tag: "app-root",
        template: template,
    };

    counter: number = 12;

    constructor() {
        console.log("AppComponent");
    }

    run() {
        console.log("run", this);

        ++this.counter;

        detectChanges();
    }
}
