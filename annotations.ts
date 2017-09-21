/// <reference path="./node_modules/reflect-metadata/Reflect.d.ts" />

export interface ComponentMetadata {
    selector: string;
    template: string;
};

export function Component(metadata: ComponentMetadata) {
    return function(target) {
        target.metadata = metadata;
    }
}
