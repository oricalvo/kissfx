import {detectChanges} from "./bootstrap";
import template from "./app.component.html";
import {ComponentMetadata} from "./annotations";

export class AppComponent {
    static metadata: ComponentMetadata = {
        tagName: "app-root",
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
