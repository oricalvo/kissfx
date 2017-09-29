export interface ViewChildRequest {
    refName: string;
    fieldName: string;
}

export interface ComponentMetadata {
    selector: string;
    template: string;
};

export interface ComponentMetadataInternal extends ComponentMetadata {
    viewChildRequests: ViewChildRequest[];
};

type Constructor<T> = new(...args: any[]) => T;

function TaggedComponent<T extends Constructor<{}>>(Base: T) {
    return class extends Base {
        static metadata: ComponentMetadata;
    }
}

export function Component<T>(metadata: ComponentMetadata) {
    return function(target) {
        target.metadata = target.metadata || {};
        Object.assign(target.metadata, metadata);
    }
}

export function ViewChild(refName: string) {
    return function(target, propName) {
        const metadata: ComponentMetadataInternal = target.constructor.metadata = target.constructor.metadata || {};
        const viewChild = metadata.viewChildRequests = metadata.viewChildRequests || [];
        viewChild.push({refName, fieldName: propName});
    }
}