import { VirtualModuleResolver } from "../../core/virtual-module-resolver";

Object.defineProperty(globalThis, "__rantyBrowserResolverModule", {
  value: { VirtualModuleResolver },
  configurable: true,
  enumerable: false,
  writable: false
});

export { VirtualModuleResolver };
