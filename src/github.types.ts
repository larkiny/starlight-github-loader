import type {Loader as AstroLoader, LoaderContext as AstroLoaderContext} from "astro/loaders";
import type {ContentEntryType} from "astro";

export interface LoaderContext extends AstroLoaderContext {
    /** @internal */
    entryTypes?: Map<string, ContentEntryType>;
}

export interface Loader extends AstroLoader {
    /** Do the actual loading of the data */
    load: (context: LoaderContext) => Promise<void>;
}