import {detectChanges} from "./bootstrap";
import template from "./clock.component.html";
import {Component, ComponentMetadata} from "./annotations";

@Component({
    selector: "app-clock",
    template: template,
})
export class ClockComponent {
    static metadata: ComponentMetadata = {
        selector: "app-clock",
        template: template,
    };

    time: Date;

    constructor() {
        console.log("ClockComponent.ctor");

        this.time = new Date();

        setInterval(() => {
            this.time = new Date();

            detectChanges();
        }, 1000);
    }
}
