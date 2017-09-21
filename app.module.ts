import {ModuleMetadata} from "./bootstrap";
import {AppComponent} from "./app.component";
import {ClockComponent} from "./clock.component";

export class AppModule {
    static metadata: ModuleMetadata = {
        components: [
            AppComponent,
            ClockComponent,
        ],
        bootstrap: AppComponent,
    };
}
