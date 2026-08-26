import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  BrowserDomAdapter,
  BrowserModule,
  EVENT_MANAGER_PLUGINS,
  EventManagerPlugin,
  HTTP_ROOT_INTERCEPTOR_FNS
} from "./chunk-5CJB733P.js";
import {
  NullViewportScroller,
  PLATFORM_SERVER_ID,
  PlatformLocation,
  ViewportScroller,
  XhrFactory,
  getDOM,
  setRootDomAdapter
} from "./chunk-TD3CMAQY.js";
import {
  APP_ID,
  ApplicationRef,
  CSP_NONCE,
  DOCUMENT,
  INTERNAL_APPLICATION_ERROR_HANDLER,
  IS_HYDRATION_DOM_REUSE_ENABLED,
  Inject,
  Injectable,
  InjectionToken,
  Injector,
  NgModule,
  PLATFORM_ID,
  PLATFORM_INITIALIZER,
  Renderer2,
  RuntimeError,
  SSR_CONTENT_INTEGRITY_MARKER,
  TESTABILITY,
  Testability,
  TransferState,
  Version,
  annotateForHydration,
  createPlatformFactory,
  inject,
  makeEnvironmentProviders,
  platformCore,
  require_cjs,
  setClassMetadata,
  setDocument,
  startMeasuring,
  stopMeasuring,
  ɵɵdefineInjectable,
  ɵɵdefineInjector,
  ɵɵdefineNgModule,
  ɵɵinject
} from "./chunk-YG3ELG3R.js";
import {
  index
} from "./chunk-ZBQXT5RQ.js";
import {
  __toESM
} from "./chunk-S6STQDT5.js";

// node_modules/@angular/platform-server/fesm2022/_server-chunk.mjs
var import_rxjs = __toESM(require_cjs(), 1);
function setDomTypes() {
  Object.assign(globalThis, index.impl);
  globalThis["KeyboardEvent"] = index.impl.Event;
}
function parseDocument(html, url = "/") {
  let window2 = index.createWindow(html, url);
  let doc = window2.document;
  return doc;
}
function serializeDocument(doc) {
  return doc.serialize();
}
var DominoAdapter = class _DominoAdapter extends BrowserDomAdapter {
  static makeCurrent() {
    setDomTypes();
    setRootDomAdapter(new _DominoAdapter());
  }
  supportsDOMEvents = false;
  static defaultDoc;
  createHtmlDocument() {
    return parseDocument("<html><head><title>fakeTitle</title></head><body></body></html>");
  }
  getDefaultDocument() {
    if (!_DominoAdapter.defaultDoc) {
      _DominoAdapter.defaultDoc = index.createDocument();
    }
    return _DominoAdapter.defaultDoc;
  }
  isElementNode(node) {
    return node ? node.nodeType === _DominoAdapter.defaultDoc.ELEMENT_NODE : false;
  }
  isShadowRoot(node) {
    return node.shadowRoot == node;
  }
  getGlobalEventTarget(doc, target) {
    if (target === "window") {
      return doc.defaultView;
    }
    if (target === "document") {
      return doc;
    }
    if (target === "body") {
      return doc.body;
    }
    return null;
  }
  getBaseHref(doc) {
    const length = doc.head.children.length;
    for (let i = 0; i < length; i++) {
      const child = doc.head.children[i];
      if (child.tagName === "BASE") {
        return child.getAttribute("href") || "";
      }
    }
    return "";
  }
  dispatchEvent(el, evt) {
    el.dispatchEvent(evt);
    const doc = el.ownerDocument || el;
    const win = doc.defaultView;
    if (win) {
      win.dispatchEvent(evt);
    }
  }
  getUserAgent() {
    return "Fake user agent";
  }
  getCookie(name) {
    throw new RuntimeError(5700, (typeof ngDevMode === "undefined" || ngDevMode) && "getCookie has not been implemented");
  }
};
var INITIAL_CONFIG = new InjectionToken("Server.INITIAL_CONFIG");
var BEFORE_APP_SERIALIZED = new InjectionToken("Server.RENDER_MODULE_HOOK");
var ENABLE_DOM_EMULATION = new InjectionToken("ENABLE_DOM_EMULATION");
var PlatformState = class _PlatformState {
  _doc;
  _enableDomEmulation = enableDomEmulation(inject(Injector));
  constructor(_doc) {
    this._doc = _doc;
  }
  renderToString() {
    if (ngDevMode && !this._enableDomEmulation && !window?.document) {
      throw new RuntimeError(5704, (typeof ngDevMode === "undefined" || ngDevMode) && "Disabled DOM emulation should only run in browser environments");
    }
    const measuringLabel = "renderToString";
    startMeasuring(measuringLabel);
    const rendered = this._enableDomEmulation ? serializeDocument(this._doc) : this._doc.documentElement.outerHTML;
    stopMeasuring(measuringLabel);
    return rendered;
  }
  getDocument() {
    return this._doc;
  }
  static ɵfac = function PlatformState_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _PlatformState)(ɵɵinject(DOCUMENT));
  };
  static ɵprov = ɵɵdefineInjectable({
    token: _PlatformState,
    factory: _PlatformState.ɵfac
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(PlatformState, [{
    type: Injectable
  }], () => [{
    type: void 0,
    decorators: [{
      type: Inject,
      args: [DOCUMENT]
    }]
  }], null);
})();
function enableDomEmulation(injector) {
  return injector.get(ENABLE_DOM_EMULATION, true);
}
var HTTP_OR_HTTPS_PROTOCOL_REGEX = /^https?:/i;
function resolveUrl(urlStr, origin, options = {}) {
  const originUrl = typeof origin === "string" ? new URL("/", origin) : origin;
  if (!urlStr) {
    return originUrl || null;
  }
  urlStr = urlStr.trim();
  let resolved;
  try {
    resolved = new URL(urlStr);
  } catch {
  }
  const {
    allowProtocolRelative = false,
    allowOriginChange = true
  } = options;
  if (resolved) {
    if (originUrl && !isSafeOriginChange(resolved, originUrl, urlStr, allowOriginChange)) {
      throwSuspiciousUrlError(urlStr);
    }
    return resolved;
  }
  if (!URL.canParse(urlStr, "http://fake")) {
    throw new RuntimeError(5701, typeof ngDevMode === "undefined" || ngDevMode ? `Invalid URL: ${urlStr}` : urlStr);
  }
  if (!originUrl) {
    return null;
  }
  if (urlStr.startsWith("//")) {
    if (!allowProtocolRelative) {
      throw new RuntimeError(5702, typeof ngDevMode === "undefined" || ngDevMode ? `Protocol relative URLs are not allowed in this context. URL: ${urlStr}` : urlStr);
    }
    return new URL(urlStr, origin);
  }
  resolved = new URL(urlStr, origin);
  if (!isSafeOriginChange(resolved, originUrl, urlStr, allowOriginChange)) {
    throwSuspiciousUrlError(urlStr);
  }
  return resolved;
}
function throwSuspiciousUrlError(urlStr) {
  throw new RuntimeError(5703, typeof ngDevMode === "undefined" || ngDevMode ? `URL ${urlStr} changed origin unexpectedly. This is suspicious and may indicate a security bypass attempt.` : urlStr);
}
function isSafeOriginChange(resolved, origin, urlStr, allowOriginChange) {
  if (origin.origin === resolved.origin) {
    return true;
  }
  if (!allowOriginChange) {
    return false;
  }
  return HTTP_OR_HTTPS_PROTOCOL_REGEX.test(urlStr);
}
var ServerXhr = class _ServerXhr {
  xhrImpl;
  async ɵloadImpl() {
    if (!this.xhrImpl) {
      if (typeof ngDevMode === "undefined" || ngDevMode) {
        console.warn("XHR support in `@angular/platform-server` is deprecated and will be removed in a future version of Angular. It has known security and performance issues in server environments, such as forwarding `Authorization` headers on cross-origin redirects and susceptibility to denial-of-service (DoS) via redirect loops. Please enable the HttpClient fetch backend instead by using `withFetch()`.");
      }
      const {
        default: xhr
      } = await import("./xhr2-AEYRUEYV.js");
      this.xhrImpl = xhr;
    }
  }
  build() {
    const impl = this.xhrImpl;
    if (!impl) {
      throw new RuntimeError(5705, (typeof ngDevMode === "undefined" || ngDevMode) && "Unexpected state in ServerXhr: XHR implementation is not loaded.");
    }
    return new impl.XMLHttpRequest();
  }
  static ɵfac = function ServerXhr_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ServerXhr)();
  };
  static ɵprov = ɵɵdefineInjectable({
    token: _ServerXhr,
    factory: _ServerXhr.ɵfac
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ServerXhr, [{
    type: Injectable
  }], null, null);
})();
var URL_SCHEMA_REGEXP = /^(?:[a-zA-Z][a-zA-Z0-9+\-.]*:)/;
function relativeUrlsTransformerInterceptorFn(request, next) {
  const trimmedUrl = request.url.trim();
  if (URL_SCHEMA_REGEXP.test(trimmedUrl)) {
    return next(request);
  }
  const platformLocation = inject(PlatformLocation);
  const {
    href,
    protocol,
    hostname,
    port
  } = platformLocation;
  if (!protocol.startsWith("http")) {
    return next(request);
  }
  let urlPrefix = `${protocol}//${hostname}`;
  if (port) {
    urlPrefix += `:${port}`;
  }
  const baseHref = platformLocation.getBaseHrefFromDOM() || href;
  const baseUrl = new URL(baseHref, urlPrefix);
  const parsedUrl = resolveUrl(request.url, baseUrl, {
    allowProtocolRelative: true
  });
  return next(request.clone({
    url: parsedUrl.toString()
  }));
}
var SERVER_HTTP_PROVIDERS = [{
  provide: XhrFactory,
  useClass: ServerXhr
}, {
  provide: HTTP_ROOT_INTERCEPTOR_FNS,
  useValue: relativeUrlsTransformerInterceptorFn,
  multi: true
}];
var ServerPlatformLocation = class _ServerPlatformLocation {
  href = "/";
  hostname = "/";
  protocol = "/";
  port = "/";
  pathname = "/";
  search = "";
  hash = "";
  _hashUpdate = new import_rxjs.Subject();
  _doc = inject(DOCUMENT);
  origin = this._doc.location.origin;
  constructor() {
    const config = inject(INITIAL_CONFIG, {
      optional: true
    });
    if (!config) {
      return;
    }
    if (config.url) {
      const {
        protocol,
        hostname,
        port,
        pathname,
        search,
        hash,
        href,
        origin
      } = resolveUrl(config.url, this.origin);
      this.protocol = protocol;
      this.hostname = hostname;
      this.port = port;
      this.pathname = pathname;
      this.search = search;
      this.hash = hash;
      this.href = href;
      this.origin = origin;
    }
  }
  getBaseHrefFromDOM() {
    return getDOM().getBaseHref(this._doc);
  }
  onPopState(fn) {
    return () => {
    };
  }
  onHashChange(fn) {
    const subscription = this._hashUpdate.subscribe(fn);
    return () => subscription.unsubscribe();
  }
  get url() {
    return `${this.pathname}${this.search}${this.hash}`;
  }
  setHash(value, oldUrl) {
    if (this.hash === value) {
      return;
    }
    this.hash = value;
    const newUrl = this.url;
    queueMicrotask(() => this._hashUpdate.next({
      type: "hashchange",
      state: null,
      oldUrl,
      newUrl
    }));
  }
  replaceState(state, title, newUrl) {
    const oldUrl = this.url;
    const {
      pathname,
      search,
      hash,
      href,
      protocol
    } = resolveUrl(newUrl, this.origin, {
      allowOriginChange: false
    });
    const writableThis = this;
    writableThis.pathname = pathname;
    writableThis.search = search;
    writableThis.href = href;
    writableThis.protocol = protocol;
    this.setHash(hash, oldUrl);
  }
  pushState(state, title, newUrl) {
    this.replaceState(state, title, newUrl);
  }
  forward() {
    throw new Error("Not implemented");
  }
  back() {
    throw new Error("Not implemented");
  }
  getState() {
    return void 0;
  }
  static ɵfac = function ServerPlatformLocation_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ServerPlatformLocation)();
  };
  static ɵprov = ɵɵdefineInjectable({
    token: _ServerPlatformLocation,
    factory: _ServerPlatformLocation.ɵfac
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ServerPlatformLocation, [{
    type: Injectable
  }], () => [], null);
})();
var ServerEventManagerPlugin = class _ServerEventManagerPlugin extends EventManagerPlugin {
  doc;
  constructor(doc) {
    super(doc);
    this.doc = doc;
  }
  supports(eventName) {
    return true;
  }
  addEventListener(element, eventName, handler, options) {
    return getDOM().onAndCancel(element, eventName, handler, options);
  }
  static ɵfac = function ServerEventManagerPlugin_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ServerEventManagerPlugin)(ɵɵinject(DOCUMENT));
  };
  static ɵprov = ɵɵdefineInjectable({
    token: _ServerEventManagerPlugin,
    factory: _ServerEventManagerPlugin.ɵfac
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ServerEventManagerPlugin, [{
    type: Injectable
  }], () => [{
    type: void 0,
    decorators: [{
      type: Inject,
      args: [DOCUMENT]
    }]
  }], null);
})();
var TRANSFER_STATE_STATUS = new InjectionToken(typeof ngDevMode === "undefined" || ngDevMode ? "TRANSFER_STATE_STATUS" : "", {
  factory: () => ({
    serialized: false
  })
});
var TRANSFER_STATE_SERIALIZATION_PROVIDERS = [{
  provide: BEFORE_APP_SERIALIZED,
  useFactory: serializeTransferStateFactory,
  multi: true
}];
function createScript(doc, textContent, nonce) {
  const script = doc.createElement("script");
  script.textContent = textContent;
  if (nonce) {
    script.setAttribute("nonce", nonce);
  }
  return script;
}
function warnIfStateTransferHappened(injector) {
  const transferStateStatus = injector.get(TRANSFER_STATE_STATUS);
  if (transferStateStatus.serialized) {
    console.warn(`Angular detected an incompatible configuration, which causes duplicate serialization of the server-side application state.

This can happen if the server providers have been provided more than once using different mechanisms. For example:

  imports: [ServerModule], // Registers server providers
  providers: [provideServerRendering()] // Also registers server providers

To fix this, ensure that the \`provideServerRendering()\` function is the only provider used and remove the other(s).`);
  }
  transferStateStatus.serialized = true;
}
function serializeTransferStateFactory() {
  const doc = inject(DOCUMENT);
  const appId = inject(APP_ID);
  const transferStore = inject(TransferState);
  const injector = inject(Injector);
  return () => {
    const measuringLabel = "serializeTransferStateFactory";
    startMeasuring(measuringLabel);
    const content = transferStore.toJson();
    if (transferStore.isEmpty) {
      return;
    }
    if (typeof ngDevMode !== "undefined" && ngDevMode) {
      warnIfStateTransferHappened(injector);
    }
    const script = createScript(doc, content, null);
    script.id = appId + "-state";
    script.setAttribute("type", "application/json");
    doc.body.appendChild(script);
    stopMeasuring(measuringLabel);
  };
}
var INTERNAL_SERVER_PLATFORM_PROVIDERS = [{
  provide: DOCUMENT,
  useFactory: _document
}, {
  provide: PLATFORM_ID,
  useValue: PLATFORM_SERVER_ID
}, {
  provide: PLATFORM_INITIALIZER,
  useFactory: initDominoAdapter,
  multi: true
}, {
  provide: PlatformLocation,
  useClass: ServerPlatformLocation,
  deps: []
}, {
  provide: PlatformState,
  deps: [DOCUMENT]
}];
function initDominoAdapter() {
  const injector = inject(Injector);
  const _enableDomEmulation = enableDomEmulation(injector);
  return () => {
    if (_enableDomEmulation) {
      DominoAdapter.makeCurrent();
    } else {
      BrowserDomAdapter.makeCurrent();
    }
  };
}
var SERVER_RENDER_PROVIDERS = [{
  provide: EVENT_MANAGER_PLUGINS,
  multi: true,
  useClass: ServerEventManagerPlugin
}];
var PLATFORM_SERVER_PROVIDERS = [TRANSFER_STATE_SERIALIZATION_PROVIDERS, SERVER_RENDER_PROVIDERS, SERVER_HTTP_PROVIDERS, {
  provide: Testability,
  useValue: null
}, {
  provide: TESTABILITY,
  useValue: null
}, {
  provide: ViewportScroller,
  useClass: NullViewportScroller
}];
var ServerModule = class _ServerModule {
  static ɵfac = function ServerModule_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ServerModule)();
  };
  static ɵmod = ɵɵdefineNgModule({
    type: _ServerModule,
    exports: [BrowserModule]
  });
  static ɵinj = ɵɵdefineInjector({
    providers: PLATFORM_SERVER_PROVIDERS,
    imports: [BrowserModule]
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ServerModule, [{
    type: NgModule,
    args: [{
      exports: [BrowserModule],
      providers: PLATFORM_SERVER_PROVIDERS
    }]
  }], null, null);
})();
function _document() {
  const injector = inject(Injector);
  const config = injector.get(INITIAL_CONFIG, null);
  const _enableDomEmulation = enableDomEmulation(injector);
  let document;
  if (config && config.document) {
    document = typeof config.document === "string" ? _enableDomEmulation ? parseDocument(config.document, config.url !== void 0 ? resolveUrl(config.url, "http://localhost").href : void 0) : window.document : config.document;
  } else {
    document = getDOM().createHtmlDocument();
  }
  setDocument(document);
  return document;
}
function platformServer(extraProviders) {
  const noServerModeSet = false;
  if (noServerModeSet) {
    globalThis["ngServerMode"] = true;
  }
  const platform = createPlatformFactory(platformCore, "server", INTERNAL_SERVER_PLATFORM_PROVIDERS)(extraProviders);
  if (noServerModeSet) {
    platform.onDestroy(() => {
      globalThis["ngServerMode"] = void 0;
    });
  }
  return platform;
}

// node_modules/@angular/platform-server/fesm2022/platform-server.mjs
var import_rxjs2 = __toESM(require_cjs(), 1);
function provideServerRendering() {
  if (false) {
    globalThis["ngServerMode"] = true;
  }
  return makeEnvironmentProviders([...PLATFORM_SERVER_PROVIDERS]);
}
var EVENT_DISPATCH_SCRIPT_ID = "ng-event-dispatch-contract";
function createServerPlatform(options) {
  const extraProviders = options.platformProviders ?? [];
  const measuringLabel = "createServerPlatform";
  startMeasuring(measuringLabel);
  const {
    document,
    url
  } = options;
  const platform = platformServer([{
    provide: INITIAL_CONFIG,
    useValue: {
      document,
      url
    }
  }, extraProviders]);
  stopMeasuring(measuringLabel);
  return platform;
}
function findEventDispatchScript(doc) {
  return doc.getElementById(EVENT_DISPATCH_SCRIPT_ID);
}
function removeEventDispatchScript(doc) {
  findEventDispatchScript(doc)?.remove();
}
function prepareForHydration(platformState, applicationRef) {
  const measuringLabel = "prepareForHydration";
  startMeasuring(measuringLabel);
  const environmentInjector = applicationRef.injector;
  const doc = platformState.getDocument();
  if (!environmentInjector.get(IS_HYDRATION_DOM_REUSE_ENABLED, false)) {
    removeEventDispatchScript(doc);
    return;
  }
  appendSsrContentIntegrityMarker(doc);
  const eventTypesToReplay = annotateForHydration(applicationRef, doc);
  if (eventTypesToReplay.regular.size || eventTypesToReplay.capture.size) {
    insertEventRecordScript(environmentInjector.get(APP_ID), doc, eventTypesToReplay, environmentInjector.get(CSP_NONCE, null));
  } else {
    removeEventDispatchScript(doc);
  }
  stopMeasuring(measuringLabel);
}
function appendSsrContentIntegrityMarker(doc) {
  const comment = doc.createComment(SSR_CONTENT_INTEGRITY_MARKER);
  doc.body.firstChild ? doc.body.insertBefore(comment, doc.body.firstChild) : doc.body.append(comment);
}
function appendServerContextInfo(applicationRef) {
  const injector = applicationRef.injector;
  let serverContext = sanitizeServerContext(injector.get(SERVER_CONTEXT, DEFAULT_SERVER_CONTEXT));
  applicationRef.components.forEach((componentRef) => {
    const renderer = componentRef.injector.get(Renderer2);
    const element = componentRef.location.nativeElement;
    if (element) {
      renderer.setAttribute(element, "ng-server-context", serverContext);
    }
  });
}
function insertEventRecordScript(appId, doc, eventTypesToReplay, nonce) {
  const measuringLabel = "insertEventRecordScript";
  startMeasuring(measuringLabel);
  const {
    regular,
    capture
  } = eventTypesToReplay;
  const eventDispatchScript = findEventDispatchScript(doc);
  if (eventDispatchScript) {
    const replayScriptContents = `window.__jsaction_bootstrap(document.body,"${appId}",${JSON.stringify(Array.from(regular))},${JSON.stringify(Array.from(capture))});`;
    const replayScript = createScript(doc, replayScriptContents, nonce);
    eventDispatchScript.after(replayScript);
  }
  stopMeasuring(measuringLabel);
}
async function renderInternal(platformRef, applicationRef) {
  const platformState = platformRef.injector.get(PlatformState);
  prepareForHydration(platformState, applicationRef);
  appendServerContextInfo(applicationRef);
  const environmentInjector = applicationRef.injector;
  const errorHandler = environmentInjector.get(INTERNAL_APPLICATION_ERROR_HANDLER);
  const callbacks = environmentInjector.get(BEFORE_APP_SERIALIZED, null);
  if (callbacks) {
    const asyncCallbacks = [];
    for (const callback of callbacks) {
      try {
        const callbackResult = callback();
        if (callbackResult) {
          asyncCallbacks.push(callbackResult);
        }
      } catch (e) {
        errorHandler(e);
      }
    }
    if (asyncCallbacks.length) {
      for (const result of await Promise.allSettled(asyncCallbacks)) {
        if (result.status === "rejected") {
          errorHandler(result.reason);
        }
      }
    }
  }
  return platformState.renderToString();
}
function asyncDestroyPlatform(platformRef) {
  return new Promise((resolve) => {
    setTimeout(() => {
      platformRef.destroy();
      resolve();
    }, 0);
  });
}
var DEFAULT_SERVER_CONTEXT = "other";
var SERVER_CONTEXT = new InjectionToken("SERVER_CONTEXT");
function sanitizeServerContext(serverContext) {
  const context = serverContext.replace(/[^a-zA-Z0-9\-]/g, "");
  return context.length > 0 ? context : DEFAULT_SERVER_CONTEXT;
}
async function renderModule(moduleType, options) {
  const {
    document,
    url,
    extraProviders: platformProviders,
    allowedHosts
  } = options;
  validateAllowedHosts(url, allowedHosts);
  const platformRef = createServerPlatform({
    document,
    url,
    platformProviders
  });
  try {
    const moduleRef = await platformRef.bootstrapModule(moduleType);
    const applicationRef = moduleRef.injector.get(ApplicationRef);
    const measuringLabel = "whenStable";
    startMeasuring(measuringLabel);
    await applicationRef.whenStable();
    stopMeasuring(measuringLabel);
    return await renderInternal(platformRef, applicationRef);
  } finally {
    await asyncDestroyPlatform(platformRef);
  }
}
async function renderApplication(bootstrap, options) {
  const renderAppLabel = "renderApplication";
  const bootstrapLabel = "bootstrap";
  const _renderLabel = "_render";
  const {
    url,
    allowedHosts
  } = options;
  validateAllowedHosts(url, allowedHosts);
  startMeasuring(renderAppLabel);
  const platformRef = createServerPlatform(options);
  try {
    startMeasuring(bootstrapLabel);
    const applicationRef = await bootstrap({
      platformRef
    });
    stopMeasuring(bootstrapLabel);
    startMeasuring(_renderLabel);
    const measuringLabel = "whenStable";
    startMeasuring(measuringLabel);
    await applicationRef.whenStable();
    stopMeasuring(measuringLabel);
    const rendered = await renderInternal(platformRef, applicationRef);
    stopMeasuring(_renderLabel);
    return rendered;
  } finally {
    await asyncDestroyPlatform(platformRef);
    stopMeasuring(renderAppLabel);
  }
}
function validateAllowedHosts(url, allowedHosts) {
  if (typeof url === "string") {
    const parsedUrl = resolveUrl(url);
    if (parsedUrl !== null) {
      const hostname = parsedUrl.hostname;
      const allowedHostsSet = new Set(allowedHosts);
      if (!isHostAllowed(hostname, allowedHostsSet)) {
        throw new RuntimeError(5706, typeof ngDevMode === "undefined" || ngDevMode ? `Host ${url} is not allowed. You can configure \`allowedHosts\` option.` : url);
      }
    }
  }
}
function isHostAllowed(hostname, allowedHosts) {
  if (allowedHosts.has("*") || allowedHosts.has(hostname)) {
    return true;
  }
  for (const allowedHost of allowedHosts) {
    if (!allowedHost.startsWith("*.")) {
      continue;
    }
    const domain = allowedHost.slice(1);
    if (hostname.endsWith(domain)) {
      return true;
    }
  }
  return false;
}
var VERSION = new Version("21.2.19");

export {
  DominoAdapter,
  INITIAL_CONFIG,
  BEFORE_APP_SERIALIZED,
  ENABLE_DOM_EMULATION,
  PlatformState,
  INTERNAL_SERVER_PLATFORM_PROVIDERS,
  SERVER_RENDER_PROVIDERS,
  ServerModule,
  platformServer,
  provideServerRendering,
  renderInternal,
  SERVER_CONTEXT,
  renderModule,
  renderApplication,
  isHostAllowed,
  VERSION
};
//# sourceMappingURL=chunk-CGRQGQHI.js.map
