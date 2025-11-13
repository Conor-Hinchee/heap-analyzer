/**
 * Built-in JavaScript and Browser Global Variables
 * 
 * This comprehensive list of built-in globals helps filter out legitimate
 * browser APIs and JavaScript standard objects during memory leak detection.
 * 
 * Based on MemLab's BuiltInGlobalVariables with additions for modern browsers.
 */

export const BUILT_IN_GLOBALS = new Set([
  // Core JavaScript
  'Object',
  'Function',
  'Array',
  'Number',
  'parseFloat',
  'parseInt',
  'Infinity',
  'NaN',
  'undefined',
  'Boolean',
  'String',
  'Symbol',
  'Date',
  'Promise',
  'RegExp',
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'globalThis',
  'JSON',
  'Math',
  'console',
  'Intl',

  // Typed Arrays
  'ArrayBuffer',
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'Uint8ClampedArray',
  'BigUint64Array',
  'BigInt64Array',
  'DataView',
  'BigInt',

  // Collections
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',

  // Meta-programming
  'Proxy',
  'Reflect',
  'FinalizationRegistry',
  'WeakRef',

  // Global functions
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'unescape',
  'eval',
  'isFinite',
  'isNaN',

  // Browser window object
  'window',
  'self',
  'document',
  'name',
  'location',
  'history',
  'navigator',
  'screen',

  // Window properties
  'customElements',
  'locationbar',
  'menubar',
  'personalbar',
  'scrollbars',
  'statusbar',
  'toolbar',
  'status',
  'closed',
  'frames',
  'length',
  'top',
  'opener',
  'parent',
  'frameElement',
  'origin',
  'external',
  'innerWidth',
  'innerHeight',
  'scrollX',
  'pageXOffset',
  'scrollY',
  'pageYOffset',
  'visualViewport',
  'screenX',
  'screenY',
  'outerWidth',
  'outerHeight',
  'devicePixelRatio',
  'event',
  'clientInformation',
  'performance',
  'crypto',
  'indexedDB',
  'sessionStorage',
  'localStorage',

  // DOM Core
  'Node',
  'NodeList',
  'NodeIterator',
  'NodeFilter',
  'Element',
  'Document',
  'DocumentType',
  'DocumentFragment',
  'CharacterData',
  'Text',
  'Comment',
  'CDATASection',
  'ProcessingInstruction',
  'Attr',
  'NamedNodeMap',
  'DOMImplementation',
  'DOMException',
  'DOMError',

  // HTML Elements
  'HTMLElement',
  'HTMLDocument',
  'HTMLCollection',
  'HTMLAllCollection',
  'HTMLFormControlsCollection',
  'HTMLOptionsCollection',
  'HTMLAnchorElement',
  'HTMLAreaElement',
  'HTMLAudioElement',
  'HTMLBRElement',
  'HTMLBaseElement',
  'HTMLBodyElement',
  'HTMLButtonElement',
  'HTMLCanvasElement',
  'HTMLDListElement',
  'HTMLDataElement',
  'HTMLDataListElement',
  'HTMLDetailsElement',
  'HTMLDialogElement',
  'HTMLDirectoryElement',
  'HTMLDivElement',
  'HTMLEmbedElement',
  'HTMLFieldSetElement',
  'HTMLFontElement',
  'HTMLFormElement',
  'HTMLFrameElement',
  'HTMLFrameSetElement',
  'HTMLHRElement',
  'HTMLHeadElement',
  'HTMLHeadingElement',
  'HTMLHtmlElement',
  'HTMLIFrameElement',
  'HTMLImageElement',
  'HTMLInputElement',
  'HTMLLIElement',
  'HTMLLabelElement',
  'HTMLLegendElement',
  'HTMLLinkElement',
  'HTMLMapElement',
  'HTMLMarqueeElement',
  'HTMLMediaElement',
  'HTMLMenuElement',
  'HTMLMetaElement',
  'HTMLMeterElement',
  'HTMLModElement',
  'HTMLOListElement',
  'HTMLObjectElement',
  'HTMLOptGroupElement',
  'HTMLOptionElement',
  'HTMLOutputElement',
  'HTMLParagraphElement',
  'HTMLParamElement',
  'HTMLPictureElement',
  'HTMLPreElement',
  'HTMLProgressElement',
  'HTMLQuoteElement',
  'HTMLScriptElement',
  'HTMLSelectElement',
  'HTMLSlotElement',
  'HTMLSourceElement',
  'HTMLSpanElement',
  'HTMLStyleElement',
  'HTMLTableCaptionElement',
  'HTMLTableCellElement',
  'HTMLTableColElement',
  'HTMLTableElement',
  'HTMLTableRowElement',
  'HTMLTableSectionElement',
  'HTMLTemplateElement',
  'HTMLTextAreaElement',
  'HTMLTimeElement',
  'HTMLTitleElement',
  'HTMLTrackElement',
  'HTMLUListElement',
  'HTMLUnknownElement',
  'HTMLVideoElement',

  // Events
  'Event',
  'EventTarget',
  'EventSource',
  'EventCounts',
  'CustomEvent',
  'UIEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'InputEvent',
  'WheelEvent',
  'TouchEvent',
  'Touch',
  'TouchList',
  'PointerEvent',
  'DragEvent',
  'ClipboardEvent',
  'CompositionEvent',
  'AnimationEvent',
  'TransitionEvent',
  'ProgressEvent',
  'ErrorEvent',
  'MessageEvent',
  'PopStateEvent',
  'HashChangeEvent',
  'PageTransitionEvent',
  'BeforeUnloadEvent',
  'StorageEvent',
  'DeviceMotionEvent',
  'DeviceOrientationEvent',
  'SecurityPolicyViolationEvent',
  'SubmitEvent',

  // CSS
  'CSS',
  'CSSStyleSheet',
  'CSSStyleDeclaration',
  'CSSRule',
  'CSSRuleList',
  'CSSStyleRule',
  'CSSImportRule',
  'CSSMediaRule',
  'CSSFontFaceRule',
  'CSSPageRule',
  'CSSNamespaceRule',
  'CSSKeyframesRule',
  'CSSKeyframeRule',
  'CSSSupportsRule',
  'StyleSheet',
  'StyleSheetList',
  'MediaList',

  // Web APIs
  'XMLHttpRequest',
  'XMLHttpRequestUpload',
  'XMLHttpRequestEventTarget',
  'fetch',
  'Request',
  'Response',
  'Headers',
  'FormData',
  'URLSearchParams',
  'URL',
  'Blob',
  'File',
  'FileList',
  'FileReader',

  // Media APIs
  'MediaStream',
  'MediaStreamTrack',
  'MediaRecorder',
  'MediaSource',
  'SourceBuffer',
  'SourceBufferList',

  // WebGL
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
  'WebGLActiveInfo',
  'WebGLBuffer',
  'WebGLContextEvent',
  'WebGLFramebuffer',
  'WebGLProgram',
  'WebGLQuery',
  'WebGLRenderbuffer',
  'WebGLSampler',
  'WebGLShader',
  'WebGLShaderPrecisionFormat',
  'WebGLSync',
  'WebGLTexture',
  'WebGLTransformFeedback',
  'WebGLUniformLocation',
  'WebGLVertexArrayObject',

  // Canvas
  'CanvasRenderingContext2D',
  'CanvasGradient',
  'CanvasPattern',
  'ImageData',
  'ImageBitmap',
  'ImageBitmapRenderingContext',
  'OffscreenCanvas',
  'OffscreenCanvasRenderingContext2D',
  'Path2D',

  // Audio
  'AudioContext',
  'AudioNode',
  'AudioBuffer',
  'AudioBufferSourceNode',
  'AudioDestinationNode',
  'AudioListener',
  'AudioParam',
  'AudioParamMap',
  'AudioProcessingEvent',
  'AudioScheduledSourceNode',
  'AudioWorklet',
  'AudioWorkletNode',
  'BaseAudioContext',
  'BiquadFilterNode',
  'ChannelMergerNode',
  'ChannelSplitterNode',
  'ConstantSourceNode',
  'ConvolverNode',
  'DelayNode',
  'DynamicsCompressorNode',
  'GainNode',
  'IIRFilterNode',
  'MediaElementAudioSourceNode',
  'MediaStreamAudioDestinationNode',
  'MediaStreamAudioSourceNode',
  'OfflineAudioCompletionEvent',
  'OfflineAudioContext',
  'OscillatorNode',
  'PannerNode',
  'PeriodicWave',
  'ScriptProcessorNode',
  'StereoPannerNode',
  'WaveShaperNode',

  // Storage APIs
  'Storage',
  'IDBFactory',
  'IDBDatabase',
  'IDBTransaction',
  'IDBObjectStore',
  'IDBIndex',
  'IDBRequest',
  'IDBOpenDBRequest',
  'IDBCursor',
  'IDBCursorWithValue',
  'IDBKeyRange',
  'IDBVersionChangeEvent',

  // Service Workers & Web Workers
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'ServiceWorkerContainer',
  'ServiceWorkerRegistration',
  'NavigationPreloadManager',

  // Geolocation
  'Geolocation',
  'GeolocationPosition',
  'GeolocationPositionError',
  'GeolocationCoordinates',

  // Notifications
  'Notification',
  'NotificationEvent',

  // WebRTC
  'RTCPeerConnection',
  'RTCSessionDescription',
  'RTCIceCandidate',
  'RTCDataChannel',
  'RTCRtpSender',
  'RTCRtpReceiver',
  'RTCRtpTransceiver',
  'RTCDTMFSender',
  'RTCStatsReport',
  'RTCCertificate',

  // Streams
  'ReadableStream',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'ReadableStreamBYOBRequest',
  'WritableStream',
  'WritableStreamDefaultWriter',
  'WritableStreamDefaultController',
  'TransformStream',
  'CompressionStream',
  'DecompressionStream',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',

  // Performance APIs
  'Performance',
  'PerformanceEntry',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceNavigation',
  'PerformanceNavigationTiming',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceResourceTiming',
  'PerformanceTiming',

  // Intersection Observer
  'IntersectionObserver',
  'IntersectionObserverEntry',
  'ResizeObserver',
  'ResizeObserverEntry',
  'ResizeObserverSize',
  'MutationObserver',
  'MutationRecord',

  // Selection & Range APIs
  'Selection',
  'Range',
  'StaticRange',
  'AbstractRange',

  // Shadow DOM
  'ShadowRoot',
  'CustomElementRegistry',

  // WebSockets
  'WebSocket',
  'CloseEvent',
  'MessageChannel',
  'MessagePort',
  'BroadcastChannel',

  // Gamepad API
  'Gamepad',
  'GamepadButton',
  'GamepadEvent',
  'GamepadHapticActuator',

  // DevTools Console Helpers
  'dir',
  'dirxml',
  'profile',
  'profileEnd',
  'clear',
  'table',
  'keys',
  'values',
  'debug',
  'undebug',
  'monitor',
  'unmonitor',
  'inspect',
  'copy',
  'queryObjects',
  '$_',
  '$0',
  '$1',
  '$2',
  '$3',
  '$4',
  'getEventListeners',
  'getAccessibleName',
  'getAccessibleRole',
  'monitorEvents',
  'unmonitorEvents',
  '$',
  '$$',
  '$x',

  // WebAssembly
  'WebAssembly',

  // Crypto API
  'SubtleCrypto',
  'CryptoKey',

  // Modern Browser APIs
  'caches',
  'CacheStorage',
  'Cache',
  'scheduler',
  'Scheduler',
  'TaskController',
  'TaskSignal',
  'AbortController',
  'AbortSignal',
  'queueMicrotask',

  // Animation APIs
  'Animation',
  'AnimationEffect',
  'AnimationTimeline',
  'DocumentTimeline',
  'KeyframeEffect',

  // Image APIs
  'ImageCapture',
  'createImageBitmap',

  // Payment APIs
  'PaymentRequest',
  'PaymentResponse',

  // Generic timer functions
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',

  // Global window methods
  'alert',
  'confirm',
  'prompt',
  'print',
  'open',
  'close',
  'focus',
  'blur',
  'stop',
  'scroll',
  'scrollBy',
  'scrollTo',
  'resizeBy',
  'resizeTo',
  'moveBy',
  'moveTo',
  'postMessage',
  'getComputedStyle',
  'getSelection',
  'matchMedia',
  'find',
  'atob',
  'btoa',

  // Standard object methods (inherited by all objects)
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
]);

/**
 * Check if a variable name is a built-in global that should be ignored during leak detection
 */
export function isBuiltInGlobal(name: string): boolean {
  // Clean up the name by removing common prefixes and extracting the actual variable name
  const cleanName = extractCleanVariableName(name);
  return BUILT_IN_GLOBALS.has(cleanName);
}

/**
 * Extract the clean variable name from heap node names
 */
function extractCleanVariableName(fullName: string): string {
  if (!fullName) return '';

  // Remove common prefixes
  let cleanName = fullName;
  
  // Handle window.varName or global.varName
  if (cleanName.includes('window.')) {
    cleanName = cleanName.split('window.')[1];
  } else if (cleanName.includes('global.')) {
    cleanName = cleanName.split('global.')[1];
  }
  
  // Take first part before any spaces or special characters
  cleanName = cleanName.split(' ')[0];
  cleanName = cleanName.split('(')[0];
  cleanName = cleanName.split('[')[0];
  cleanName = cleanName.split('.')[0];
  
  return cleanName;
}

/**
 * Get statistics about built-in globals for debugging
 */
export function getBuiltInGlobalStats() {
  return {
    total: BUILT_IN_GLOBALS.size,
    categories: {
      core: ['Object', 'Function', 'Array', 'console'].filter(name => BUILT_IN_GLOBALS.has(name)).length,
      dom: ['Element', 'Document', 'Node'].filter(name => BUILT_IN_GLOBALS.has(name)).length,
      events: ['Event', 'EventTarget', 'MouseEvent'].filter(name => BUILT_IN_GLOBALS.has(name)).length,
      webapis: ['fetch', 'XMLHttpRequest', 'WebSocket'].filter(name => BUILT_IN_GLOBALS.has(name)).length,
    }
  };
}