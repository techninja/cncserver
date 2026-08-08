var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// node_modules/hybrids/src/utils.js
var camelToDashMap = new Map();
function camelToDash(str) {
  let result = camelToDashMap.get(str);
  if (result === void 0) {
    result = str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    camelToDashMap.set(str, result);
  }
  return result;
}
function dispatch(host, eventType, options = {}) {
  return host.dispatchEvent(new globalThis.CustomEvent(eventType, {bubbles: false, ...options}));
}
function stringifyElement(target) {
  return `<${String(target.tagName).toLowerCase()}>`;
}
function walkInShadow(target, cb) {
  if (target.nodeType === globalThis.Node.ELEMENT_NODE) {
    cb(target);
    if (target.shadowRoot) {
      walkInShadow(target.shadowRoot, cb);
    }
  }
  const walker = globalThis.document.createTreeWalker(target, globalThis.NodeFilter.SHOW_ELEMENT, null, false);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    cb(el);
    if (el.shadowRoot) {
      walkInShadow(el.shadowRoot, cb);
    }
  }
}
var debugMode = false;
function isDebugMode() {
  return debugMode;
}
function debug() {
  debugMode = true;
}
var deferred = Promise.resolve();
var storePointer = new WeakMap();

// node_modules/hybrids/src/emitter.js
var queue = new Set();
function add(fn) {
  if (queue.size === 0) {
    queue = new Set();
    deferred.then(execute);
  }
  queue.add(fn);
}
function clear(fn) {
  queue.delete(fn);
}
function execute() {
  for (const fn of queue) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
  queue.clear();
}

// node_modules/hybrids/src/cache.js
var entries = new WeakMap();
var stack = new Set();
function dispatch2(entry) {
  const contexts = [];
  let index = 0;
  while (entry) {
    entry.resolved = false;
    if (entry.contexts) {
      for (const context2 of entry.contexts) {
        if (!stack.has(context2) && !contexts.includes(context2)) {
          contexts.push(context2);
        }
      }
    }
    if (entry.observe) {
      add(entry.observe);
    }
    entry = contexts[index++];
  }
}
function getEntry(target, key2) {
  let map = entries.get(target);
  if (!map) {
    map = new Map();
    entries.set(target, map);
  }
  let entry = map.get(key2);
  if (!entry) {
    entry = {
      key: key2,
      target,
      value: void 0,
      assertValue: void 0,
      lastValue: void 0,
      resolved: false,
      contexts: void 0,
      deps: void 0,
      observe: void 0
    };
    map.set(key2, entry);
  }
  return entry;
}
function getEntries(target) {
  const targetMap = entries.get(target);
  if (targetMap)
    return [...targetMap.values()];
  return [];
}
var context = null;
function getCurrentValue() {
  return context?.value;
}
function get(target, key2, fn) {
  const entry = getEntry(target, key2);
  if (context) {
    if (!entry.contexts)
      entry.contexts = new Set();
    if (!context.deps)
      context.deps = new Set();
    entry.contexts.add(context);
    context.deps.add(entry);
  }
  if (entry.resolved)
    return entry.value;
  if (entry.deps) {
    for (const depEntry of entry.deps) {
      depEntry.contexts.delete(entry);
    }
    entry.deps.clear();
  }
  const lastContext = context;
  try {
    if (stack.has(entry)) {
      throw Error(`Circular get invocation is forbidden: '${key2}'`);
    }
    context = entry;
    stack.add(entry);
    entry.value = fn(target, entry.assertValue);
    entry.resolved = true;
    context = lastContext;
    stack.delete(entry);
  } catch (e) {
    context = lastContext;
    stack.delete(entry);
    if (context) {
      context.deps.delete(entry);
      entry.contexts.delete(context);
    }
    throw e;
  }
  return entry.value;
}
function assert(target, key2, value2, force) {
  if (context && context.target === target && !force) {
    throw Error(`Try to update the '${key2}' property while getting the '${context.key}' property`);
  }
  const entry = getEntry(target, key2);
  entry.value = void 0;
  entry.assertValue = value2;
  dispatch2(entry);
}
function set(target, key2, fn, value2) {
  const entry = getEntry(target, key2);
  const nextValue = fn(target, value2, entry.value);
  if (nextValue !== entry.value) {
    entry.value = nextValue;
    entry.assertValue = void 0;
    dispatch2(entry);
  }
}
function observe(target, key2, fn, callback) {
  const entry = getEntry(target, key2);
  entry.observe = () => {
    const value2 = get(target, key2, fn);
    if (value2 !== entry.lastValue) {
      callback(target, value2, entry.lastValue);
      entry.lastValue = value2;
    }
  };
  try {
    entry.observe();
  } catch (e) {
    console.error(e);
  }
  return () => {
    entry.observe = void 0;
    entry.lastValue = void 0;
  };
}
var gc = new Set();
function deleteEntry(entry) {
  if (!gc.size) {
    setTimeout(() => {
      for (const e of gc) {
        if (!e.contexts || e.contexts.size === 0) {
          const targetMap = entries.get(e.target);
          targetMap.delete(e.key);
        }
      }
      gc.clear();
    });
  }
  gc.add(entry);
}
function invalidateEntry(entry, options) {
  dispatch2(entry);
  if (options.clearValue) {
    entry.value = void 0;
    entry.assertValue = void 0;
    entry.lastValue = void 0;
  }
  if (options.deleteEntry) {
    if (entry.deps) {
      for (const depEntry of entry.deps) {
        depEntry.contexts.delete(entry);
      }
      entry.deps = void 0;
    }
    if (entry.contexts) {
      for (const context2 of entry.contexts) {
        context2.deps.delete(entry);
      }
      entry.contexts = void 0;
    }
    deleteEntry(entry);
  }
}
function invalidate(target, key2, options = {}) {
  const entry = getEntry(target, key2);
  invalidateEntry(entry, options);
}
function invalidateAll(target, options = {}) {
  const targetMap = entries.get(target);
  if (targetMap) {
    for (const entry of targetMap.values()) {
      invalidateEntry(entry, options);
    }
  }
}

// node_modules/hybrids/src/render.js
function render(desc) {
  if (desc.reflect) {
    throw TypeError(`'reflect' option is not supported for 'render' property`);
  }
  const {value: fn, observe: observe2} = desc;
  if (typeof fn !== "function") {
    throw TypeError(`Value for 'render' property must be a function: ${typeof fn}`);
  }
  const result = {
    connect: desc.connect,
    observe: observe2 ? (host, flush, lastFlush) => {
      observe2(host, flush(), lastFlush);
    } : (host, flush) => {
      flush();
    }
  };
  const shadow = desc.shadow ? {
    mode: desc.shadow.mode || "open",
    delegatesFocus: desc.shadow.delegatesFocus || false
  } : desc.shadow;
  if (shadow) {
    result.value = (host) => {
      const target = host.shadowRoot || host.attachShadow(shadow);
      const update2 = fn(host);
      return () => {
        update2(host, target);
        return target;
      };
    };
  } else if (shadow === false) {
    result.value = (host) => {
      const update2 = fn(host);
      return () => {
        update2(host, host);
        return host;
      };
    };
  } else {
    result.value = (host) => {
      const update2 = fn(host);
      return () => update2(host);
    };
  }
  return result;
}

// node_modules/hybrids/src/value.js
function reflect(host, value2, attrName) {
  if (!value2 && value2 !== 0) {
    host.removeAttribute(attrName);
  } else {
    host.setAttribute(attrName, value2 === true ? "" : value2);
  }
}
function value(key2, desc) {
  const type = typeof desc.value;
  const defaultValue = type === "object" ? Object.freeze(desc.value) : desc.value;
  switch (type) {
    case "string":
      desc.value = (host, value2) => value2 !== void 0 ? String(value2) : defaultValue;
      break;
    case "number":
      desc.value = (host, value2) => value2 !== void 0 ? Number(value2) : defaultValue;
      break;
    case "boolean":
      desc.value = (host, value2) => value2 !== void 0 ? Boolean(value2) : defaultValue;
      break;
    case "function":
      desc.value = defaultValue;
      break;
    default:
      desc.value = (_, value2 = defaultValue) => value2;
  }
  let observe2 = desc.observe;
  if (desc.reflect) {
    const attrName = camelToDash(key2);
    const fn = typeof desc.reflect === "function" ? (host, value2, attrName2) => reflect(host, desc.reflect(value2), attrName2) : reflect;
    observe2 = desc.observe ? (host, value2, lastValue) => {
      fn(host, value2, attrName);
      desc.observe(host, value2, lastValue);
    } : (host, value2) => fn(host, value2, attrName);
  }
  return {
    ...desc,
    observe: observe2,
    writable: type !== "function" || defaultValue.length > 1
  };
}

// node_modules/hybrids/src/define.js
var constructors = new WeakMap();
var callbacks = new WeakMap();
var disconnects = new WeakMap();
function connectedCallback(host, set4) {
  for (const fn of this.connects)
    set4.add(fn(host));
  for (const fn of this.observers)
    set4.add(fn(host));
}
function compile(hybrids, HybridsElement) {
  if (HybridsElement) {
    const prevHybrids = constructors.get(HybridsElement);
    if (hybrids === prevHybrids)
      return HybridsElement;
    for (const key2 of Object.keys(prevHybrids)) {
      if (key2 === "tag")
        continue;
      delete HybridsElement.prototype[key2];
    }
  } else {
    HybridsElement = class extends globalThis.HTMLElement {
      constructor() {
        super();
        for (const key2 of HybridsElement.writable) {
          if (hasOwnProperty.call(this, key2)) {
            const value2 = this[key2];
            delete this[key2];
            this[key2] = value2;
          } else {
            const value2 = this.getAttribute(camelToDash(key2));
            if (value2 !== null) {
              this[key2] = value2 === "" && typeof this[key2] === "boolean" || value2;
            }
          }
        }
      }
      connectedCallback() {
        const set4 = new Set();
        disconnects.set(this, set4);
        const cb = connectedCallback.bind(HybridsElement, this, set4);
        callbacks.set(this, cb);
        add(cb);
      }
      disconnectedCallback() {
        clear(callbacks.get(this));
        for (const fn of disconnects.get(this)) {
          if (fn)
            fn();
        }
        invalidateAll(this);
      }
    };
  }
  constructors.set(HybridsElement, Object.freeze(hybrids));
  const connects = new Set();
  const observers = new Set();
  const writable = new Set();
  for (const key2 of Object.keys(hybrids)) {
    if (key2 === "tag")
      continue;
    let desc = hybrids[key2];
    if (typeof desc !== "object" || desc === null) {
      desc = {value: desc};
    } else if (!hasOwnProperty.call(desc, "value")) {
      throw TypeError(`The 'value' option is required for '${key2}' property of the '${hybrids.tag}' element`);
    }
    desc = key2 === "render" ? render(desc) : value(key2, desc);
    if (desc.writable) {
      writable.add(key2);
    }
    Object.defineProperty(HybridsElement.prototype, key2, {
      get: function get4() {
        return get(this, key2, desc.value);
      },
      set: desc.writable ? function assert2(newValue) {
        assert(this, key2, newValue);
      } : void 0,
      enumerable: true,
      configurable: true
    });
    if (desc.connect) {
      connects.add((host) => desc.connect(host, key2, () => {
        invalidate(host, key2);
      }));
    }
    if (desc.observe) {
      observers.add((host) => observe(host, key2, desc.value, desc.observe));
    }
  }
  HybridsElement.connects = connects;
  HybridsElement.observers = observers;
  HybridsElement.writable = writable;
  return HybridsElement;
}
var updateQueue = new Map();
function update(HybridsElement) {
  if (!updateQueue.size) {
    deferred.then(() => {
      walkInShadow(globalThis.document.body, (node) => {
        if (updateQueue.has(node.constructor)) {
          const prevHybrids = updateQueue.get(node.constructor);
          const hybrids = constructors.get(node.constructor);
          node.disconnectedCallback();
          for (const key2 of Object.keys(hybrids)) {
            const type = typeof hybrids[key2];
            const clearValue = type !== "object" && type !== "function" && hybrids[key2] !== prevHybrids[key2];
            if (clearValue)
              node.removeAttribute(camelToDash(key2));
            invalidate(node, key2, {clearValue});
          }
          node.connectedCallback();
        }
      });
      updateQueue.clear();
    });
  }
  updateQueue.set(HybridsElement, constructors.get(HybridsElement));
}
var tags = new Set();
function define(hybrids) {
  if (!hybrids.tag) {
    throw TypeError("Error while defining an element: 'tag' property with dashed tag name is required");
  }
  if (tags.has(hybrids.tag)) {
    throw TypeError(`Error while defining '${hybrids.tag}' element: tag name is already defined`);
  }
  if (!tags.size)
    deferred.then(() => tags.clear());
  tags.add(hybrids.tag);
  const HybridsElement = globalThis.customElements.get(hybrids.tag);
  if (HybridsElement) {
    if (constructors.get(HybridsElement)) {
      update(HybridsElement);
      compile(hybrids, HybridsElement);
      return hybrids;
    }
    throw TypeError(`Custom element with '${hybrids.tag}' tag name already defined outside of the hybrids context`);
  }
  globalThis.customElements.define(hybrids.tag, compile(hybrids));
  return hybrids;
}
function from(components, {root = "", prefix} = {}) {
  for (const key2 of Object.keys(components)) {
    const hybrids = components[key2];
    if (!hybrids.tag) {
      const tag = camelToDash([].concat(root).reduce((acc, root2) => acc.replace(root2, ""), key2).replace(/^[./]+/, "").replace(/\//g, "-").replace(/\.[a-zA-Z]+$/, ""));
      hybrids.tag = prefix ? `${prefix}-${tag}` : tag;
    }
    define(hybrids);
  }
  return components;
}
var define_default = Object.freeze(Object.assign(define, {
  compile: (hybrids) => compile(hybrids),
  from
}));

// node_modules/hybrids/src/mount.js
var targets = new WeakMap();
var prevMap = new WeakMap();
function mount(target, hybrids) {
  const prevHybrids = prevMap.get(target);
  if (prevHybrids === hybrids)
    return;
  const HybridsElement = define_default.compile(hybrids);
  prevMap.set(target, hybrids);
  if (targets.has(target))
    targets.get(target)();
  targets.set(target, () => {
    HybridsElement.prototype.disconnectedCallback.call(target);
    for (const [key2] of descriptors) {
      delete target[key2];
    }
    targets.delete(target);
  });
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(HybridsElement.prototype));
  HybridsElement.prototype.connectedCallback.call(target);
  for (const [key2, desc] of descriptors) {
    if (key2 === "constructor" || key2 === "connectedCallback" || key2 === "disconnectedCallback") {
      continue;
    }
    Object.defineProperty(target, key2, {
      ...desc,
      configurable: true
    });
    if (prevHybrids) {
      const type = typeof hybrids[key2];
      const clearValue = type !== "object" && type !== "function" && hybrids[key2] !== prevHybrids[key2];
      if (clearValue)
        target.removeAttribute(camelToDash(key2));
      invalidate(target, key2, {clearValue});
    }
  }
}

// node_modules/hybrids/src/parent.js
function walk(host, fn) {
  let parentElement = host.parentElement || host.parentNode.host;
  while (parentElement) {
    const hybrids = constructors.get(parentElement.constructor);
    if (hybrids && fn(hybrids, host)) {
      return parentElement;
    }
    parentElement = parentElement.parentElement || parentElement.parentNode && parentElement.parentNode.host;
  }
  return parentElement || null;
}
function parent(hybridsOrFn) {
  const fn = typeof hybridsOrFn === "function" ? hybridsOrFn : (hybrids) => hybrids === hybridsOrFn;
  return {
    value: (host) => walk(host, fn),
    connect(host, key2, invalidate2) {
      return invalidate2;
    }
  };
}

// node_modules/hybrids/src/children.js
function walk2(node, fn, options, items = [], host = node) {
  for (const child of Array.from(node.children)) {
    const hybrids = constructors.get(child.constructor);
    if (hybrids && fn(hybrids, host)) {
      items.push(child);
      if (options.deep && options.nested) {
        walk2(child, fn, options, items, host);
      }
    } else if (options.deep) {
      walk2(child, fn, options, items, host);
    }
  }
  return items;
}
function children(hybridsOrFn, options = {deep: false, nested: false}) {
  const fn = typeof hybridsOrFn === "function" ? hybridsOrFn : (hybrids) => hybrids === hybridsOrFn;
  return {
    value: (host) => walk2(host, fn, options),
    connect(host, key2, invalidate2) {
      const observer = new globalThis.MutationObserver(invalidate2);
      observer.observe(host, {
        childList: true,
        subtree: !!options.deep
      });
      return () => {
        observer.disconnect();
      };
    }
  };
}

// node_modules/hybrids/src/store.js
var connect = Symbol("store.connect");
var definitions = new WeakMap();
var stales = new WeakMap();
function resolve(config, model, lastModel) {
  if (lastModel) {
    definitions.set(lastModel, null);
    stales.set(lastModel, model);
  }
  definitions.set(model, config);
  if (config.storage.observe) {
    const modelValue = model && config.isInstance(model) ? model : null;
    const lastModelValue = lastModel && config.isInstance(lastModel) ? lastModel : null;
    if (modelValue !== lastModelValue) {
      config.storage.observe(modelValue, lastModelValue);
    }
  }
  return model;
}
function resolveWithInvalidate(config, model, lastModel) {
  resolve(config, model, lastModel);
  if (config.invalidate && (config.storage.loose || !lastModel || !config.isInstance(lastModel))) {
    config.invalidate();
  }
  return model;
}
function syncCache(config, id, model, invalidate2 = true) {
  set(config, id, invalidate2 ? resolveWithInvalidate : resolve, model);
  return model;
}
var currentTimestamp;
function getCurrentTimestamp() {
  if (!currentTimestamp) {
    currentTimestamp = Date.now();
    deferred.then(() => {
      currentTimestamp = void 0;
    });
  }
  return currentTimestamp;
}
var timestamps = new WeakMap();
function getTimestamp(model) {
  let timestamp = timestamps.get(model);
  if (!timestamp) {
    timestamp = getCurrentTimestamp();
    timestamps.set(model, timestamp);
  }
  return timestamp;
}
function setTimestamp(model) {
  timestamps.set(model, getCurrentTimestamp());
  return model;
}
function invalidateTimestamp(model) {
  timestamps.set(model, 1);
  return model;
}
function hashCode(str) {
  return globalThis.btoa(Array.from(str).reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0));
}
var offlinePrefix = "hybrids:store:cache";
var offlineKeys = {};
var clearPromise;
function setupOfflineKey(config, threshold) {
  const key2 = `${offlinePrefix}:${hashCode(JSON.stringify(config.model))}`;
  offlineKeys[key2] = getCurrentTimestamp() + threshold;
  if (!clearPromise) {
    clearPromise = Promise.resolve().then(() => {
      const previousKeys = JSON.parse(globalThis.localStorage.getItem(offlinePrefix)) || {};
      const timestamp = getCurrentTimestamp();
      for (const k of Object.keys(previousKeys)) {
        if (!offlineKeys[k] && previousKeys[k] < timestamp) {
          globalThis.localStorage.removeItem(k);
          delete previousKeys[k];
        }
      }
      globalThis.localStorage.setItem(offlinePrefix, JSON.stringify({...previousKeys, ...offlineKeys}));
      clearPromise = null;
    });
  }
  return key2;
}
function setupStorage(config, options) {
  if (typeof options === "function")
    options = {get: options};
  const result = {
    cache: true,
    loose: false,
    ...options
  };
  if (result.observe) {
    const fn = result.observe;
    if (typeof fn !== "function") {
      throw TypeError(`Storage 'observe' property must be a function: ${typeof result.observe}`);
    }
    result.observe = (model, lastModel) => {
      try {
        let id = lastModel ? lastModel.id : model.id;
        fn(id, model, lastModel);
      } catch (e) {
        console.error(e);
      }
    };
  }
  if (result.cache === false || result.cache === 0) {
    result.validate = (cachedModel) => !cachedModel || getTimestamp(cachedModel) === getCurrentTimestamp();
  } else if (typeof result.cache === "number") {
    result.validate = (cachedModel) => !cachedModel || getTimestamp(cachedModel) + result.cache > getCurrentTimestamp();
  } else {
    if (result.cache !== true) {
      throw TypeError(`Storage 'cache' property must be a boolean or number: ${typeof result.cache}`);
    }
    result.validate = (cachedModel) => getTimestamp(cachedModel) !== 1;
  }
  if (!result.get) {
    result.get = (id) => {
      throw notFoundError(stringifyId(id));
    };
  }
  if (result.offline) {
    try {
      const isBool = result.offline === true;
      const threshold = isBool ? 1e3 * 60 * 60 * 24 * 30 : result.offline;
      const offlineKey = setupOfflineKey(config, threshold);
      const items = JSON.parse(globalThis.localStorage.getItem(offlineKey)) || {};
      let flush;
      result.offline = Object.freeze({
        key: offlineKey,
        threshold,
        get: isBool ? (id) => {
          if (hasOwnProperty.call(items, id)) {
            return JSON.parse(items[id][1]);
          }
          return null;
        } : (id) => {
          if (hasOwnProperty.call(items, id)) {
            const item = items[id];
            if (item[0] + threshold < getCurrentTimestamp()) {
              delete items[id];
              return null;
            }
            return JSON.parse(item[1]);
          }
          return null;
        },
        set(id, values) {
          if (values) {
            items[id] = [
              getCurrentTimestamp(),
              JSON.stringify(values, function replacer(key2, value2) {
                if (value2 === this[""])
                  return value2;
                if (value2 && typeof value2 === "object") {
                  const valueConfig = definitions.get(value2);
                  if (valueConfig === config && value2.id === id) {
                    return String(value2);
                  }
                  const offline = valueConfig && valueConfig.storage.offline;
                  if (offline) {
                    if (valueConfig.list) {
                      return value2.map((model) => {
                        configs.get(valueConfig.model).storage.offline.set(model.id, model);
                        return `${model}`;
                      });
                    }
                    valueConfig.storage.offline.set(value2.id, value2);
                    return `${value2}`;
                  }
                }
                return value2;
              })
            ];
          } else {
            delete items[id];
          }
          if (!flush) {
            flush = Promise.resolve().then(() => {
              const timestamp = getCurrentTimestamp();
              for (const key2 of Object.keys(items)) {
                if (items[key2][0] + threshold < timestamp) {
                  delete items[key2];
                }
              }
              globalThis.localStorage.setItem(offlineKey, JSON.stringify(items));
              flush = null;
            });
          }
          return values;
        }
      });
    } catch (e) {
      console.error("Error while setup offline cache", e);
      result.offline = false;
    }
  }
  return Object.freeze(result);
}
function memoryStorage(config) {
  return {
    get: config.enumerable ? () => null : () => config.create({}),
    set: config.enumerable ? (id, values) => values : (id, values) => values === null ? {id} : values,
    list: config.enumerable && function list(id) {
      if (id) {
        throw TypeError(`Memory-based model definition does not support id`);
      }
      const result = [];
      for (const {key: key2, value: value2} of getEntries(config)) {
        if (key2 !== config && value2 && !error(value2))
          result.push(key2);
      }
      return result;
    },
    loose: true
  };
}
function bootstrap(Model, nested) {
  if (Array.isArray(Model)) {
    return setupListModel(Model[0], nested);
  }
  return setupModel(Model, nested);
}
function getTypeConstructor(type, key2) {
  switch (type) {
    case "string":
      return (v) => v !== void 0 && v !== null ? String(v) : "";
    case "number":
      return Number;
    case "boolean":
      return Boolean;
    default:
      throw TypeError(`The value of the '${key2}' must be a string, number or boolean: ${type}`);
  }
}
function setModelState(model, state, value2) {
  const lastConfig = getEntry(model, "state").value;
  assert(model, "state", {
    state,
    value: value2,
    error: (state === "error" ? value2 : lastConfig?.error) || false
  }, true);
  return model;
}
function getModelState(model) {
  return get(model, "state", (model2, config = {state: "ready", error: false}) => config);
}
function uuid(temp) {
  return temp ? (temp ^ Math.random() * 16 >> temp / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid);
}
var refs = new WeakSet();
var records = new WeakMap();
function ref(fn) {
  if (typeof fn !== "function") {
    throw TypeError(`The first argument must be a function: ${typeof fn}`);
  }
  refs.add(fn);
  return fn;
}
function record(value2) {
  if (value2 === void 0 || value2 === null) {
    throw TypeError(`The value must be defined: ${value2}`);
  }
  if (!refs.has(value2) && typeof value2 === "function") {
    throw TypeError(`A function is not supported as the value of the record`);
  }
  const model = Object.freeze({});
  records.set(model, value2);
  return model;
}
var validationMap = new WeakMap();
function resolveKey(Model, key2, config) {
  let defaultValue = config.model[key2];
  if (refs.has(defaultValue))
    defaultValue = defaultValue();
  if (records.has(defaultValue)) {
    const value2 = records.get(defaultValue);
    if (typeof value2 === "function") {
      throw TypeError(`A function is not supported as the value of the record for '${key2}' property`);
    }
    return {
      defaultValue: {id: true, value: value2},
      type: "record"
    };
  }
  let type = typeof defaultValue;
  if (defaultValue instanceof String || defaultValue instanceof Number || defaultValue instanceof Boolean) {
    const check = validationMap.get(defaultValue);
    if (!check) {
      throw TypeError(stringifyModel(Model, `You must use primitive ${typeof defaultValue.valueOf()} value for '${key2}' property of the provided model definition`));
    }
    defaultValue = defaultValue.valueOf();
    type = typeof defaultValue;
    config.checks.set(key2, check);
  }
  return {defaultValue, type};
}
function stringifyModel(Model, msg2) {
  return `${msg2}

Model definition:

${JSON.stringify(Model, null, 2)}
`;
}
var resolvedPromise = Promise.resolve();
var configs = new WeakMap();
function setupModel(Model, nested) {
  if (typeof Model !== "object" || Model === null) {
    throw TypeError(`Model definition must be an object: ${typeof Model}`);
  }
  let config = configs.get(Model);
  if (config && !config.enumerable) {
    if (nested && !config.nested) {
      throw TypeError(stringifyModel(Model, "Provided model definition for nested object already used as a root definition"));
    }
    if (!nested && config.nested) {
      throw TypeError(stringifyModel(Model, "Nested model definition cannot be used outside of the parent definition"));
    }
  }
  if (!config) {
    const storage = Model[connect];
    if (typeof storage === "object")
      Object.freeze(storage);
    let invalidatePromise;
    const enumerable = hasOwnProperty.call(Model, "id");
    const external = !!storage;
    const checks = new Map();
    const proto = {};
    Object.defineProperty(proto, "toString", {
      value: function() {
        return this.id;
      }
    });
    const placeholder = Object.create(proto);
    config = {
      model: Model,
      external,
      enumerable,
      nested: !enumerable && !external && nested,
      placeholder: (id) => {
        const model = Object.create(placeholder);
        definitions.set(model, config);
        storePointer.set(model, store);
        if (enumerable)
          model.id = id;
        return Object.freeze(model);
      },
      isInstance: (model) => Object.getPrototypeOf(model) !== placeholder,
      invalidate: () => {
        if (!invalidatePromise) {
          invalidatePromise = resolvedPromise.then(() => {
            invalidate(config, config, {clearValue: true});
            invalidatePromise = null;
          });
        }
      },
      checks
    };
    configs.set(Model, config);
    config.storage = setupStorage(config, storage || memoryStorage(config));
    const transform = Object.keys(Object.freeze(Model)).map((key2) => {
      if (key2 !== "id") {
        Object.defineProperty(placeholder, key2, {
          get() {
            throw Error(stringifyModel(Model, `Model instance in ${getModelState(this).state} state - use store.pending(), store.error(), or store.ready() guards`));
          },
          enumerable: true
        });
      }
      if (key2 === "id") {
        if (Model[key2] !== true) {
          throw TypeError(stringifyModel(Model, "The 'id' property in the model definition must be set to 'true' or not be defined"));
        }
        return (model, data, lastModel) => {
          let id;
          if (hasOwnProperty.call(data, "id")) {
            id = normalizeId(data.id);
          } else if (lastModel) {
            id = lastModel.id;
          } else {
            id = uuid();
          }
          Object.defineProperty(model, "id", {value: id, enumerable: true});
        };
      }
      const {defaultValue, type} = resolveKey(Model, key2, config);
      switch (type) {
        case "function":
          return (model) => {
            Object.defineProperty(model, key2, {
              get() {
                return get(this, key2, () => defaultValue(this));
              }
            });
          };
        case "object": {
          if (defaultValue === null) {
            throw TypeError(`The value for the '${key2}' must be an object instance: ${defaultValue}`);
          }
          const isArray = Array.isArray(defaultValue);
          if (isArray) {
            const nestedType = typeof defaultValue[0];
            if (nestedType === "undefined") {
              throw TypeError(`The first item of the '${key2}' array must be defined`);
            }
            if (nestedType !== "object") {
              if (nestedType === "function" && ![String, Number, Boolean].includes(defaultValue[0])) {
                throw TypeError(`The array item for the '${key2}' must be one of the primitive types constructor: String, Number, or Boolean`);
              }
              const Constructor = nestedType === "function" ? defaultValue[0] : getTypeConstructor(nestedType, key2);
              const defaultArray = nestedType === "function" ? [] : Object.freeze(defaultValue.map(Constructor));
              return (model, data, lastModel) => {
                if (hasOwnProperty.call(data, key2)) {
                  if (!Array.isArray(data[key2])) {
                    throw TypeError(`The value for '${key2}' property must be an array: ${typeof data[key2]}`);
                  }
                  model[key2] = Object.freeze(data[key2].map(Constructor));
                } else if (lastModel && hasOwnProperty.call(lastModel, key2)) {
                  model[key2] = lastModel[key2];
                } else {
                  model[key2] = defaultArray;
                }
              };
            }
            const localConfig = bootstrap(defaultValue, true);
            if (localConfig.external && config.storage.offline && localConfig.storage.offline && localConfig.storage.offline.threshold < config.storage.offline.threshold) {
              throw Error(`External nested model for '${key2}' property has lower offline threshold (${localConfig.storage.offline.threshold} ms) than the parent definition (${config.storage.offline.threshold} ms)`);
            }
            if (localConfig.enumerable && defaultValue[1]) {
              const nestedOptions = defaultValue[1];
              if (typeof nestedOptions !== "object") {
                throw TypeError(`Options for '${key2}' array property must be an object instance: ${typeof nestedOptions}`);
              }
              if (nestedOptions.loose) {
                config.contexts = config.contexts || new Set();
                config.contexts.add(bootstrap(defaultValue[0]));
              }
            }
            return (model, data, lastModel) => {
              if (hasOwnProperty.call(data, key2)) {
                if (!Array.isArray(data[key2])) {
                  throw TypeError(`The value for '${key2}' property must be an array: ${typeof data[key2]}`);
                }
                model[key2] = localConfig.create(data[key2], true);
              } else {
                model[key2] = lastModel && lastModel[key2] || !localConfig.enumerable && localConfig.create(defaultValue) || [];
              }
            };
          }
          if (Object.keys(defaultValue).length === 0) {
            throw TypeError(`The object for the '${key2}' must have at least one property`);
          }
          const nestedConfig = bootstrap(defaultValue, true);
          if (nestedConfig.enumerable || nestedConfig.external) {
            if (config.storage.offline && nestedConfig.storage.offline && nestedConfig.storage.offline.threshold < config.storage.offline.threshold) {
              throw Error(`External nested model for '${key2}' property has lower offline threshold (${nestedConfig.storage.offline.threshold} ms) than the parent definition (${config.storage.offline.threshold} ms)`);
            }
            return (model, data, lastModel) => {
              let resultModel;
              if (hasOwnProperty.call(data, key2)) {
                const nestedData = data[key2];
                if (typeof nestedData !== "object" || nestedData === null) {
                  if (nestedData !== void 0 && nestedData !== null) {
                    resultModel = {id: nestedData};
                  }
                } else {
                  const dataConfig = definitions.get(nestedData);
                  if (dataConfig) {
                    if (dataConfig.model !== defaultValue) {
                      throw TypeError("Model instance must match the definition");
                    }
                    resultModel = nestedData;
                  } else {
                    const lastNestedModel = getEntry(nestedConfig, data[key2].id).value;
                    resultModel = nestedConfig.create(nestedData, lastNestedModel && nestedConfig.isInstance(lastNestedModel) ? lastNestedModel : void 0);
                    syncCache(nestedConfig, resultModel.id, resultModel);
                  }
                }
              } else {
                resultModel = lastModel && lastModel[key2];
              }
              if (resultModel) {
                const id = resultModel.id;
                Object.defineProperty(model, key2, {
                  get() {
                    return get(this, key2, () => get2(defaultValue, id));
                  },
                  enumerable: true
                });
              } else {
                model[key2] = void 0;
              }
            };
          }
          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key2)) {
              model[key2] = data[key2] === null ? nestedConfig.create({}) : nestedConfig.create(data[key2], lastModel && lastModel[key2]);
            } else {
              model[key2] = lastModel ? lastModel[key2] : nestedConfig.create({});
            }
          };
        }
        case "record": {
          const localConfig = bootstrap(defaultValue, true);
          return (model, data, lastModel) => {
            if (data[key2] === null) {
              model[key2] = {};
              return;
            }
            if (data[key2] === void 0) {
              model[key2] = lastModel?.[key2] ?? {};
              return;
            }
            if (typeof data[key2] !== "object") {
              throw TypeError(`The value for the '${key2}' must be an object instance: ${typeof data[key2]}`);
            }
            const record2 = data[key2];
            let result = {};
            if (lastModel) {
              for (const id of Object.keys(lastModel[key2])) {
                if (!hasOwnProperty.call(record2, id)) {
                  Object.defineProperty(result, id, {
                    get() {
                      return lastModel[key2][id];
                    },
                    enumerable: true,
                    configurable: true
                  });
                }
              }
            }
            for (const id of Object.keys(record2)) {
              if (record2[id] === null) {
                continue;
              }
              const item = localConfig.create({id, value: record2[id]}, {id, value: lastModel && lastModel[key2][id]});
              Object.defineProperty(result, id, {
                get() {
                  return get(this, id, () => item.value);
                },
                enumerable: true
              });
            }
            model[key2] = result;
          };
        }
        default: {
          const Constructor = getTypeConstructor(type, key2);
          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key2)) {
              model[key2] = Constructor(data[key2]);
            } else if (lastModel && hasOwnProperty.call(lastModel, key2)) {
              model[key2] = lastModel[key2];
            } else {
              model[key2] = defaultValue;
            }
          };
        }
      }
    });
    config.create = function create(data, lastModel) {
      if (data === null)
        return null;
      if (typeof data !== "object") {
        throw TypeError(`Model values must be an object instance: ${data}`);
      }
      const model = Object.create(proto);
      for (const fn of transform) {
        fn(model, data, lastModel);
      }
      definitions.set(model, config);
      storePointer.set(model, store);
      return Object.freeze(model);
    };
    Object.freeze(placeholder);
    Object.freeze(config);
  }
  return config;
}
var listPlaceholderPrototype = Object.getOwnPropertyNames(Array.prototype).reduce((acc, key2) => {
  if (key2 === "length" || key2 === "constructor")
    return acc;
  Object.defineProperty(acc, key2, {
    get() {
      throw Error(stringifyModel(get2(definitions.get(this).model), `Model list instance in ${getModelState(this).state} state - use store.pending(), store.error(), or store.ready() guards`));
    }
  });
  return acc;
}, []);
var lists = new WeakMap();
function setupListModel(Model, nested) {
  let config = lists.get(Model);
  if (config && !config.enumerable) {
    if (!nested && config.nested) {
      throw TypeError(stringifyModel(Model, "Nested model definition cannot be used outside of the parent definition"));
    }
  }
  if (!config) {
    const modelConfig = setupModel(Model);
    const contexts = new Set();
    if (modelConfig.storage.loose)
      contexts.add(modelConfig);
    if (!nested) {
      if (!modelConfig.enumerable) {
        throw TypeError(stringifyModel(Model, "Provided model definition does not support listing (it must be enumerable - set `id` property to `true`)"));
      }
      if (!modelConfig.storage.list) {
        throw TypeError(stringifyModel(Model, "Provided model definition storage does not support `list` action"));
      }
    }
    nested = !modelConfig.enumerable && !modelConfig.external && nested;
    config = {
      list: true,
      nested,
      model: Model,
      contexts,
      enumerable: modelConfig.enumerable,
      external: modelConfig.external,
      placeholder: (id) => {
        const model = Object.create(listPlaceholderPrototype);
        definitions.set(model, config);
        Object.defineProperties(model, {
          id: {value: id},
          toString: {
            value: function() {
              return this.id;
            }
          }
        });
        return Object.freeze(model);
      },
      isInstance: (model) => Object.getPrototypeOf(model) !== listPlaceholderPrototype,
      create(items, invalidate2 = false) {
        if (items === null)
          return null;
        const result = [];
        for (const data of items) {
          let id;
          if (typeof data === "object" && data !== null) {
            id = stringifyId(data.id);
            const dataConfig = definitions.get(data);
            let model = data;
            if (dataConfig) {
              if (dataConfig.model !== Model) {
                throw TypeError("Model instance must match the definition");
              }
            } else {
              const lastModel = modelConfig.enumerable && getEntry(modelConfig, id).value;
              model = modelConfig.create(data, lastModel && modelConfig.isInstance(lastModel) ? lastModel : void 0);
              if (modelConfig.enumerable) {
                id = stringifyId(model.id);
                syncCache(modelConfig, id, model, invalidate2);
              }
            }
            if (!modelConfig.enumerable) {
              result.push(model);
            }
          } else {
            if (!modelConfig.enumerable) {
              throw TypeError(`Model instance must be an object: ${typeof data}`);
            }
            id = stringifyId(data);
          }
          if (modelConfig.enumerable) {
            const key2 = result.length;
            Object.defineProperty(result, key2, {
              get() {
                return get(this, key2, () => get2(Model, id));
              },
              enumerable: true
            });
          }
        }
        Object.defineProperties(result, {
          id: {value: items.id},
          toString: {
            value: function() {
              return this.id;
            }
          }
        });
        definitions.set(result, config);
        storePointer.set(result, store);
        return Object.freeze(result);
      }
    };
    config.storage = Object.freeze({
      ...setupStorage(config, {
        cache: modelConfig.storage.cache,
        get: !nested && ((id) => modelConfig.storage.list(id))
      }),
      offline: modelConfig.storage.offline && {
        threshold: modelConfig.storage.offline.threshold,
        get: (id) => {
          const stringId = stringifyId(id);
          let result = modelConfig.storage.offline.get(hashCode(String(stringId)));
          if (result) {
            result = result.map((item) => modelConfig.storage.offline.get(item));
            result.id = stringId;
            return result;
          }
          return null;
        },
        set: (id, values) => {
          modelConfig.storage.offline.set(hashCode(String(stringifyId(id))), values.map((item) => {
            modelConfig.storage.offline.set(item.id, item);
            return item.id;
          }));
        }
      }
    });
    lists.set(Model, Object.freeze(config));
  }
  return config;
}
function normalizeId(id) {
  if (typeof id !== "object")
    return id !== void 0 ? String(id) : id;
  const result = {};
  for (const key2 of Object.keys(id).sort()) {
    if (typeof id[key2] === "object" && id[key2] !== null) {
      throw TypeError(`You must use primitive value for '${key2}' key: ${typeof id[key2]}`);
    }
    result[key2] = id[key2];
  }
  return result;
}
function stringifyId(id) {
  id = normalizeId(id);
  return typeof id === "object" ? JSON.stringify(id) : id;
}
var notFoundErrors = new WeakSet();
function notFoundError(Model, stringId) {
  const err = Error(stringifyModel(Model, `Model instance ${stringId !== void 0 ? `with '${stringId}' id ` : ""}does not exist`));
  notFoundErrors.add(err);
  return err;
}
function mapError(model, err) {
  if (isDebugMode() && !notFoundErrors.has(err)) {
    console.error(err);
  }
  return setModelState(model, "error", err);
}
function get2(Model, id) {
  const config = bootstrap(Model);
  let stringId;
  if (config.enumerable) {
    stringId = stringifyId(id);
    if (!stringId && !config.list && !draftMap.get(config)) {
      throw TypeError(stringifyModel(Model, `Provided model definition requires non-empty id: "${stringId}"`));
    }
  } else if (id !== void 0) {
    throw TypeError(stringifyModel(Model, `Provided model definition does not support id: ${JSON.stringify(id)}`));
  }
  const {offline, validate} = config.storage;
  const entry = getEntry(config, stringId);
  const cachedModel = entry.value;
  if (cachedModel && getModelState(cachedModel).state !== "pending" && !validate(cachedModel)) {
    entry.resolved = false;
  }
  return get(config, stringId, () => {
    id = normalizeId(id);
    let validContexts = true;
    if (config.contexts) {
      for (const context2 of config.contexts) {
        if (get(context2, context2, () => getCurrentTimestamp()) === getCurrentTimestamp()) {
          validContexts = false;
        }
      }
    }
    if (validContexts && cachedModel && validate(cachedModel)) {
      return cachedModel;
    }
    const fallback = () => cachedModel || offline && config.create(offline.get(stringId)) || config.placeholder(id);
    let result;
    try {
      result = config.storage.get(id);
    } catch (e) {
      return setTimestamp(mapError(fallback(), e));
    }
    if (!(result instanceof Promise) && result !== void 0 && typeof result !== "object") {
      throw TypeError(stringifyModel(Model, `Storage 'get' method must return a Promise, an instance, or null: ${result}`));
    }
    try {
      if (typeof result !== "object" || result === null) {
        if (offline)
          offline.set(stringId, null);
        throw notFoundError(Model, stringId);
      }
    } catch (e) {
      return setTimestamp(mapError(fallback(), e));
    }
    if (result instanceof Promise) {
      result = result.then((data) => {
        if (data !== void 0 && typeof data !== "object") {
          throw TypeError(stringifyModel(Model, `Storage 'get' method must resolve to an instance, or null: ${data}`));
        }
        if (typeof data !== "object" || data === null) {
          if (offline)
            offline.set(stringId, null);
          throw notFoundError(Model, stringId);
        }
        if (data.id !== id)
          data.id = id;
        const model2 = config.create(data);
        if (offline)
          offline.set(stringId, model2);
        return syncCache(config, stringId, setTimestamp(model2));
      }).catch((e) => syncCache(config, stringId, mapError(fallback(), e)));
      return setModelState(fallback(), "pending", result);
    }
    if (result.id !== id)
      result.id = id;
    const model = config.create(result);
    if (offline) {
      Promise.resolve().then(() => {
        offline.set(stringId, model);
      });
    }
    return resolve(config, setTimestamp(model), cachedModel);
  });
}
var draftMap = new WeakMap();
function getValidationError(errors) {
  const keys = Object.keys(errors);
  const e = Error(`Model validation failed (${keys.join(", ")}) - read the details from 'errors' property`);
  e.errors = errors;
  return e;
}
function set2(model, values = {}) {
  let config = definitions.get(model);
  if (config === null) {
    model = stales.get(model);
    config = definitions.get(model);
  }
  if (config === null) {
    throw Error("Provided model instance has expired. Haven't you used stale value?");
  }
  let isInstance = !!config;
  if (!config)
    config = bootstrap(model);
  if (config.nested) {
    throw stringifyModel(config.model, TypeError("Setting provided nested model instance is not supported, use the root model instance"));
  }
  if (config.list) {
    throw TypeError("Listing model definition does not support 'set' method");
  }
  if (!config.storage.set) {
    throw stringifyModel(config.model, TypeError("Provided model definition storage does not support 'set' method"));
  }
  if (!isInstance && !config.enumerable) {
    isInstance = true;
    model = get2(model);
  }
  if (isInstance) {
    const promise = pending(model);
    if (promise) {
      return promise.then((m) => set2(m, values));
    }
  }
  const isDraft = draftMap.get(config);
  let id;
  if (config.enumerable && !isInstance && (!values || typeof values !== "object")) {
    throw TypeError(`Values must be an object instance: ${values}`);
  }
  if (!isDraft && values && hasOwnProperty.call(values, "id")) {
    throw TypeError(`Values must not contain 'id' property: ${values.id}`);
  }
  const localModel = config.create(values, isInstance ? model : void 0);
  const keys = values ? Object.keys(values) : [];
  const errors = {};
  const lastError = isInstance && isDraft && error(model);
  let hasErrors = false;
  if (localModel && config.checks.size) {
    for (const [key2, fn] of config.checks.entries()) {
      if (keys.indexOf(key2) === -1) {
        if (lastError && lastError.errors && lastError.errors[key2]) {
          hasErrors = true;
          errors[key2] = lastError.errors[key2];
        }
        if (isDraft && localModel[key2] == config.model[key2]) {
          continue;
        }
      }
      let checkResult;
      try {
        checkResult = fn(localModel[key2], key2, localModel);
      } catch (e) {
        checkResult = e;
      }
      if (checkResult !== true && checkResult !== void 0) {
        hasErrors = true;
        errors[key2] = checkResult || true;
      }
    }
  }
  let result;
  try {
    if (hasErrors && !isDraft) {
      throw getValidationError(errors);
    }
    id = localModel ? localModel.id : model.id;
    result = config.storage.set(isInstance ? id : void 0, localModel, keys);
  } catch (e) {
    if (isInstance)
      setModelState(model, "error", e);
    return Promise.reject(e);
  }
  if (!(result instanceof Promise) && result !== void 0 && typeof result !== "object") {
    throw TypeError(stringifyModel(config.model, `Storage 'set' method must return a Promise, an instance, or null: ${result}`));
  }
  result = Promise.resolve(result).then((data) => {
    if (data !== void 0 && typeof data !== "object") {
      throw TypeError(stringifyModel(config.model, `Storage 'set' method must resolve to an instance or null: ${data}`));
    }
    const resultModel = data === localModel ? localModel : config.create(data);
    if (isInstance && resultModel && id !== resultModel.id) {
      throw TypeError(stringifyModel(config.model, `Local and storage data must have the same id: '${id}', '${resultModel.id}'`));
    }
    let resultId = resultModel ? resultModel.id : id;
    if (hasErrors && isDraft) {
      setModelState(resultModel, "error", getValidationError(errors));
    }
    if (isDraft && isInstance && hasOwnProperty.call(data, "id") && (!localModel || localModel.id !== model.id)) {
      resultId = model.id;
    } else if (config.storage.offline) {
      config.storage.offline.set(resultId, resultModel);
    }
    return syncCache(config, resultId, resultModel || mapError(config.placeholder(resultId), notFoundError(config.model, id)), true);
  }).catch((err) => {
    err = err !== void 0 ? err : Error("Undefined error");
    if (isInstance)
      setModelState(model, "error", err);
    throw err;
  });
  if (isInstance)
    setModelState(model, "pending", result);
  return result;
}
function sync(model, values) {
  if (typeof values !== "object") {
    throw TypeError(`Values must be an object instance: ${values}`);
  }
  let config = definitions.get(model);
  if (config === null) {
    model = stales.get(model);
    config = definitions.get(model);
  }
  if (config === null) {
    throw Error("Provided model instance has expired. Haven't you used stale value?");
  }
  if (config === void 0) {
    if (!values) {
      throw TypeError("Values must be defined for usage with model definition");
    }
    config = bootstrap(model);
    model = void 0;
  } else if (values && hasOwnProperty.call(values, "id")) {
    throw TypeError(`Values must not contain 'id' property: ${values.id}`);
  }
  if (config.list) {
    throw TypeError("Listing model definition is not supported in sync method");
  }
  const resultModel = config.create(values, model);
  const id = values ? resultModel.id : model.id;
  return syncCache(config, id, resultModel || mapError(config.placeholder(id), notFoundError(config.model, id)));
}
function clear2(model, clearValue = true) {
  if (typeof model !== "object" || model === null) {
    throw TypeError(`The first argument must be a model instance or a model definition: ${model}`);
  }
  let config = definitions.get(model);
  if (config === null) {
    throw Error("Provided model instance has expired. Haven't you used stale value from the outer scope?");
  }
  if (config) {
    const offline = clearValue && config.storage.offline;
    if (offline)
      offline.set(model.id, null);
    invalidateTimestamp(model);
    invalidate(config, model.id, {clearValue, deleteEntry: clearValue});
  } else {
    if (!configs.get(model) && !lists.get(model[0]))
      return;
    config = bootstrap(model);
    const offline = clearValue && config.storage.offline;
    for (const entry of getEntries(config)) {
      if (entry.key === config)
        continue;
      if (offline)
        offline.set(entry.key, null);
      invalidateTimestamp(entry.value);
    }
    invalidateAll(config, {clearValue, deleteEntry: clearValue});
  }
}
function pending(...models) {
  let isPending = false;
  const result = models.map((model) => {
    try {
      const {state, value: value2} = getModelState(model);
      if (state === "pending") {
        isPending = true;
        return value2;
      }
    } catch (e) {
    }
    return Promise.resolve(model);
  });
  return isPending && (models.length > 1 ? Promise.all(result) : result[0]);
}
function resolveToLatest(model, id) {
  model = stales.get(model) || model;
  if (!definitions.get(model))
    model = get2(model, id);
  const promise = pending(model);
  if (!promise) {
    const e = error(model);
    return e ? Promise.reject(e) : Promise.resolve(model);
  }
  return promise.then((m) => resolveToLatest(m));
}
function error(model, property) {
  if (model === null || typeof model !== "object")
    return false;
  const state = getModelState(model);
  if (property !== void 0) {
    const errors = typeof state.error === "object" && state.error && state.error.errors;
    return property === null ? !errors && state.error : errors[property];
  }
  return state.error;
}
function ready(...models) {
  return models.length > 0 && models.every((model) => {
    const config = definitions.get(model);
    return !!(config && config.isInstance(model));
  });
}
function getValuesFromModel(model, values) {
  model = {...model, ...values};
  delete model.id;
  return model;
}
function submit(draft, values = {}) {
  const config = definitions.get(draft);
  if (!config || !draftMap.has(config)) {
    throw TypeError(`Provided model instance is not a draft: ${draft}`);
  }
  if (pending(draft)) {
    throw Error("Model draft in pending state");
  }
  const modelConfig = draftMap.get(config);
  let result;
  if (getEntry(modelConfig, draft.id).value) {
    const model = get2(modelConfig.model, draft.id);
    result = Promise.resolve(pending(model) || model).then((resolvedModel) => set2(resolvedModel, getValuesFromModel(draft, values)));
  } else {
    result = set2(modelConfig.model, getValuesFromModel(draft, values));
  }
  result = result.then((resultModel) => {
    setModelState(draft, "ready");
    return set2(draft, resultModel).then(() => resultModel);
  }).catch((e) => {
    setModelState(draft, "error", e);
    return Promise.reject(e);
  });
  setModelState(draft, "pending", result);
  return result;
}
function required(value2, key2) {
  return !!value2 || `${key2} is required`;
}
function valueWithValidation(defaultValue, validate = required, errorMessage = "") {
  switch (typeof defaultValue) {
    case "string":
      defaultValue = new String(defaultValue);
      break;
    case "number":
      defaultValue = new Number(defaultValue);
      break;
    case "boolean":
      defaultValue = new Boolean(defaultValue);
      break;
    default:
      throw TypeError(`Default value must be a string, number or boolean: ${typeof defaultValue}`);
  }
  let fn;
  if (validate instanceof RegExp) {
    fn = (value2) => validate.test(value2) || errorMessage;
  } else if (typeof validate === "function") {
    fn = (...args) => {
      const result = validate(...args);
      return result !== true && result !== void 0 ? errorMessage || result : result;
    };
  } else {
    throw TypeError(`The second argument must be a RegExp instance or a function: ${typeof validate}`);
  }
  validationMap.set(defaultValue, fn);
  return defaultValue;
}
function resolveId(value2) {
  if (value2 && definitions.has(value2))
    return value2.id;
  return value2 ?? void 0;
}
function resolveModel(Model, config, id) {
  id = resolveId(id);
  if (!config.enumerable && !config.list) {
    return get2(Model, id);
  }
  const lastModel = getCurrentValue();
  const nextModel = id !== void 0 || config.list ? get2(Model, id) : void 0;
  if (lastModel && nextModel && nextModel.id !== lastModel.id && ready(lastModel) && !ready(nextModel)) {
    const config2 = definitions.get(lastModel);
    const clone = Object.freeze(Object.create(lastModel));
    definitions.set(clone, config2);
    assert(clone, "state", getModelState(nextModel), true);
    return clone;
  }
  return nextModel;
}
function resolveDraft(Model, config, id, value2) {
  const lastValue = getCurrentValue();
  id = resolveId(id ?? lastValue?.id);
  if (id === void 0 && !lastValue && (value2 === void 0 || value2 === null)) {
    if (config.enumerable) {
      const draftModel = config.create({});
      id = draftModel.id;
      syncCache(config, draftModel.id, draftModel, false);
    } else {
      clear2(config.model);
    }
  }
  return get2(Model, id);
}
function store(Model, options = {}) {
  const config = bootstrap(Model);
  if (options.id !== void 0 && typeof options.id !== "function") {
    const id = options.id;
    options.id = (host) => host[id];
  }
  if (options.id && !config.enumerable) {
    throw TypeError("Store factory for singleton model definition does not support 'id' option");
  }
  let draft;
  if (options.draft) {
    if (config.list) {
      throw TypeError("Draft mode is not supported for listing model definition");
    }
    draft = bootstrap({
      ...Model,
      [connect]: {
        get(id) {
          const model = get2(config.model, id);
          return pending(model) || model;
        },
        set(id, values) {
          return values === null ? {id} : values;
        }
      }
    });
    draftMap.set(draft, config);
    Model = draft.model;
    return {
      value: options.id ? (host, value2) => resolveDraft(Model, draft, options.id(host), value2) : (host, value2) => resolveDraft(Model, draft, value2, value2),
      connect: config.enumerable ? (host, key2) => () => {
        clear2(host[key2], true);
      } : void 0
    };
  }
  return {
    value: options.id ? (host) => resolveModel(Model, config, options.id(host)) : (host, value2) => resolveModel(Model, config, value2)
  };
}
var store_default = Object.freeze(Object.assign(store, {
  connect,
  get: get2,
  set: set2,
  sync,
  clear: clear2,
  pending,
  error,
  ready,
  submit,
  value: valueWithValidation,
  resolve: resolveToLatest,
  ref,
  record
}));

// node_modules/hybrids/src/template/helpers/transition.js
var transition_default = globalThis.document && globalThis.document.startViewTransition !== void 0 && function transition(template) {
  return async function fn(host, target) {
    template.useLayout = fn.useLayout;
    if (transition.instance) {
      console.warn(`${stringifyElement(host)}: view transition already in progress`);
      transition.instance.finished.finally(() => {
        template(host, target);
      });
      return;
    }
    transition.instance = globalThis.document.startViewTransition(() => {
      template(host, target);
    });
    transition.instance.finished.finally(() => {
      transition.instance = void 0;
    });
  };
} || ((fn) => fn);

// node_modules/hybrids/src/router.js
var connect2 = Symbol("router.connect");
var configs2 = new WeakMap();
var flushes = new WeakMap();
var stacks = new WeakMap();
var routers = new WeakMap();
var rootRouter = null;
var entryPoints = new Set();
var scrollMap = new WeakMap();
var focusMap = new WeakMap();
function saveLayout() {
  const target = stacks.get(rootRouter)[0];
  if (!target)
    return;
  const focusEl = globalThis.document.activeElement;
  focusMap.set(target, rootRouter.contains(focusEl) && focusEl);
  const map = new Map();
  for (const el of [
    globalThis.document.documentElement,
    globalThis.document.body
  ]) {
    map.set(el, {left: el.scrollLeft, top: el.scrollTop});
  }
  walkInShadow(target, (el) => {
    if (el.scrollLeft || el.scrollTop) {
      map.set(el, {left: el.scrollLeft, top: el.scrollTop});
    }
  });
  scrollMap.set(target, map);
}
function focusElement(target) {
  if (target.tabIndex === -1) {
    const outline = target.style.outline;
    target.tabIndex = 0;
    target.style.outline = "none";
    target.addEventListener("blur", () => {
      target.removeAttribute("tabindex");
      target.style.outline = outline;
    }, {once: true});
  }
  target.focus({preventScroll: true});
}
async function restoreLayout(target) {
  const activeEl = globalThis.document.activeElement;
  await deferred;
  transition_default.instance && await transition_default.instance.ready;
  focusElement(focusMap.get(target) || (rootRouter.contains(activeEl) ? activeEl : rootRouter));
  const map = scrollMap.get(target);
  if (map) {
    const config = configs2.get(target);
    const state = globalThis.history.state;
    const entry = state.find((e) => e.id === config.id);
    const clear3 = entry && entry.params.scrollToTop;
    for (const [el, {left, top}] of map) {
      el.scrollLeft = clear3 ? 0 : left;
      el.scrollTop = clear3 ? 0 : top;
    }
    scrollMap.delete(target);
  } else {
    for (const el of [
      globalThis.document.documentElement,
      globalThis.document.body
    ]) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }
  setTimeout(() => {
    globalThis.history.scrollRestoration = "auto";
  }, 0);
}
function mapUrlParam(value2) {
  return value2 === true ? 1 : value2 || "";
}
var metaParams = ["scrollToTop"];
function setupBrowserUrl(browserUrl, id) {
  const [pathname, search = ""] = browserUrl.split("?");
  const searchParams = search ? search.split(",") : [];
  const normalizedPathname = pathname.replace(/^\//, "").split("/");
  const pathnameParams = normalizedPathname.reduce((params, name) => {
    if (name.startsWith(":")) {
      const key2 = name.slice(1);
      if (searchParams.includes(key2)) {
        throw Error(`The '${key2}' already used in search params`);
      }
      if (params.includes(key2)) {
        throw Error(`The '${key2}' already used in pathname`);
      }
      params.push(key2);
    }
    return params;
  }, []);
  return {
    browserUrl,
    pathnameParams,
    paramsKeys: [...searchParams, ...pathnameParams],
    url(params, strict = false) {
      let temp = "";
      for (let part of normalizedPathname) {
        if (part.startsWith(":")) {
          const key2 = part.slice(1);
          if (!hasOwnProperty.call(params, key2)) {
            throw Error(`The '${key2}' parameter must be defined for <${id}>`);
          }
          part = mapUrlParam(params[key2]);
        }
        temp += `/${part}`;
      }
      const url = new URL(temp, globalThis.location.origin);
      for (const key2 of Object.keys(params)) {
        if (pathnameParams.includes(key2) || strict && (metaParams.includes(key2) || !searchParams.includes(key2))) {
          continue;
        }
        url.searchParams.append(key2, mapUrlParam(params[key2]));
      }
      return url;
    },
    match(url) {
      const params = {};
      const temp = url.pathname.replace(/^\//, "").split("/");
      if (temp.length !== normalizedPathname.length)
        return null;
      for (let i = 0; i < temp.length; i += 1) {
        const part = temp[i];
        const normalizedPart = normalizedPathname[i];
        if (normalizedPart.startsWith(":")) {
          const key2 = normalizedPart.slice(1);
          params[key2] = part;
        } else if (part !== normalizedPart) {
          return null;
        }
      }
      for (const [key2, value2] of url.searchParams) {
        params[key2] = value2;
      }
      return params;
    }
  };
}
function hasInStack(config, target) {
  return config.stack.some((temp) => {
    if (temp === target)
      return true;
    return hasInStack(temp, target);
  });
}
function addEntryPoint(config) {
  if (config.browserUrl) {
    entryPoints.add(config);
  }
  for (const child of config.stack) {
    addEntryPoint(child);
  }
}
function setupViews(views, options, parent2 = null, nestedParent = null) {
  if (typeof views === "function")
    views = views();
  views = [].concat(views);
  return views.map((hybrids) => {
    const config = configs2.get(hybrids);
    if (config && hasInStack(config, parent2)) {
      throw Error(`<${config.id}> cannot be in the stack of <${parent2.id}>, as it is an ancestor in the stack tree`);
    }
    return setupView(hybrids, options, parent2, nestedParent);
  });
}
function getNestedRouterOptions(hybrids, config) {
  const nestedRouters = Object.values(hybrids).map((desc) => routers.get(desc)).filter((d) => d);
  if (nestedRouters.length) {
    if (nestedRouters.length > 1) {
      throw TypeError(`<${config.id}> must contain at most one nested router, found: ${nestedRouters.length}`);
    }
    if (config.dialog) {
      throw TypeError(`Nested routers are not supported in dialogs. Remove the router property definition from <${config.id}>`);
    }
    if (config.browserUrl) {
      throw TypeError(`A view with nested router must not have the url option. Remove the url option from <${config.id}>`);
    }
  }
  return nestedRouters[0];
}
function getConfigById(id) {
  const Constructor = globalThis.customElements.get(id);
  return configs2.get(Constructor);
}
function setupView(hybrids, routerOptions, parent2, nestedParent) {
  const id = hybrids.tag;
  let config = getConfigById(id);
  if (config && config.hybrids !== hybrids) {
    config = null;
  }
  if (!config) {
    const Constructor = globalThis.customElements.get(id);
    if (!Constructor || constructors.get(Constructor) !== hybrids) {
      throw Error(`<${id}> view must be defined by 'define()' function before it can be used in router factory`);
    }
    let browserUrl = null;
    const options = {
      dialog: false,
      guard: false,
      multiple: false,
      replace: false,
      ...hybrids[connect2]
    };
    const {connects} = Constructor;
    if (options.dialog) {
      connects.add((host) => {
        const root = rootRouter;
        const goBackOnEscKey = (event) => {
          const stack2 = stacks.get(root);
          if (stack2[0] === host && event.key === "Escape") {
            event.stopPropagation();
            globalThis.history.go(-1);
          }
        };
        const focusDialog = (event) => {
          const stack2 = stacks.get(root);
          if (stack2[0] === host && !host.contains(event.target) && event.target !== host) {
            focusElement(host);
          }
        };
        root.addEventListener("focusin", focusDialog);
        root.addEventListener("focusout", focusDialog);
        host.addEventListener("keydown", goBackOnEscKey);
        focusElement(host);
        return () => {
          root.removeEventListener("focusin", focusDialog);
          root.removeEventListener("focusout", focusDialog);
          host.removeEventListener("keydown", goBackOnEscKey);
        };
      });
    }
    if (options.url) {
      if (options.dialog) {
        throw Error(`The 'url' option is not supported for dialogs - remove it from <${id}>`);
      }
      if (typeof options.url !== "string") {
        throw TypeError(`The 'url' option in <${id}> must be a string: ${typeof options.url}`);
      }
      browserUrl = setupBrowserUrl(options.url, id);
      for (const key2 of browserUrl.paramsKeys) {
        const desc = Object.getOwnPropertyDescriptor(Constructor.prototype, key2);
        if (!desc || !desc.set) {
          throw Error(`'${key2}' parameter from the url is not ${desc ? "writable" : "defined"} in <${id}>`);
        }
      }
    }
    const writableParams = [...Constructor.writable];
    const stateParams = writableParams.filter((k) => !routerOptions.params.includes(k) && !metaParams.includes(k));
    const clearParams = browserUrl ? stateParams.filter((k) => !browserUrl.pathnameParams.includes(k)) : stateParams;
    connects.add((_) => observe(_, connect2, (host) => {
      const params = {};
      for (const key2 of stateParams) {
        let value2 = host[key2];
        if (value2 === void 0 || value2 === hybrids[key2] || typeof value2 === "object" && value2.toString === Object.prototype.toString) {
          params[key2] = void 0;
        } else {
          params[key2] = mapUrlParam(value2).toString();
        }
      }
      return params;
    }, (host, params, lastParams) => {
      if (!lastParams || !globalThis.history.state)
        return;
      const state = globalThis.history.state;
      const index = state.findIndex((entry2) => {
        if (entry2.id === id)
          return true;
        if (entry2.nested) {
          let nested = entry2.nested;
          while (nested) {
            if (nested.id === id)
              return true;
            nested = nested.nested;
          }
        }
      });
      let entry = state[index];
      while (entry.id !== id && entry.nested)
        entry = entry.nested;
      params = {...entry.params, ...params};
      for (const key2 of clearParams) {
        if (params[key2] === void 0)
          delete params[key2];
      }
      globalThis.history.replaceState(state.map((entry2, i) => i === index ? config.getEntry(params) : entry2), "", browserUrl ? config.url(params, true) : "");
    }));
    let guard;
    if (options.guard) {
      guard = () => {
        try {
          return options.guard();
        } catch (e) {
          console.error(e);
          return false;
        }
      };
    }
    config = {
      id,
      hybrids,
      dialog: options.dialog,
      multiple: options.multiple,
      replace: options.replace,
      guard,
      parent: parent2,
      nestedParent,
      nestedRoots: void 0,
      parentsWithGuards: void 0,
      stack: [],
      ...browserUrl || {
        url(params) {
          const url = new URL("", globalThis.location.origin);
          for (const key2 of Object.keys(params)) {
            url.searchParams.append(key2, mapUrlParam(params[key2]));
          }
          return new URL(`${routerOptions.url}#@${id}${url.search}`, globalThis.location.origin);
        },
        match(url) {
          const params = {};
          for (const [key2, value2] of url.searchParams) {
            if (writableParams.includes(key2) || metaParams.includes(key2))
              params[key2] = value2;
          }
          return params;
        }
      },
      create() {
        const el = new Constructor();
        configs2.set(el, config);
        return el;
      },
      getEntry(params = {}, other) {
        let entryParams = {};
        for (const key2 of Object.keys(params)) {
          if (writableParams.includes(key2)) {
            entryParams[key2] = params[key2];
          }
        }
        const entry = {id, params: entryParams, ...other};
        const guardConfig = config.parentsWithGuards.find((c) => !c.guard());
        if (guardConfig) {
          return guardConfig.getEntry(params, {from: entry});
        }
        if (config.guard && config.guard()) {
          return {...config.stack[0].getEntry(params)};
        }
        if (config.nestedParent) {
          return config.nestedParent.getEntry(params, {nested: entry});
        }
        for (const key2 of metaParams) {
          if (hasOwnProperty.call(params, key2)) {
            entry.params[key2] = params[key2];
          }
        }
        return entry;
      }
    };
    configs2.set(hybrids, config);
    configs2.set(Constructor, config);
    if (parent2 && !parent2.stack.includes(config)) {
      parent2.stack.push(config);
    }
    if (options.stack) {
      if (options.dialog) {
        throw Error(`The 'stack' option is not supported for dialogs - remove it from <${id}>`);
      }
      setupViews(options.stack, routerOptions, config, nestedParent);
    }
  } else {
    config.parent = parent2;
    config.nestedParent = nestedParent;
    if (parent2 && !parent2.stack.includes(config)) {
      parent2.stack.push(config);
    }
  }
  if (!parent2) {
    addEntryPoint(config);
  }
  config.parentsWithGuards = [];
  while (parent2) {
    if (parent2.guard)
      config.parentsWithGuards.unshift(parent2);
    parent2 = parent2.parent;
  }
  const nestedRouterOptions = getNestedRouterOptions(hybrids, config);
  if (nestedRouterOptions) {
    config.nestedRoots = setupViews(nestedRouterOptions.views, {...routerOptions, ...nestedRouterOptions}, config, config);
    config.stack = config.stack.concat(config.nestedRoots);
  }
  return config;
}
function getUrl(view, params = {}) {
  const config = configs2.get(view);
  return config ? config.url(params) : "";
}
function getAllEntryParams(entry) {
  const params = {};
  while (entry) {
    Object.assign(params, entry.params);
    entry = entry.nested;
  }
  return params;
}
function getBackUrl({nested = false, scrollToTop = false} = {}) {
  const state = globalThis.history.state;
  if (!state)
    return "";
  if (state.length > 1) {
    const entry2 = state[0];
    let i = 1;
    let prevEntry = state[i];
    if (nested) {
      while (prevEntry.nested) {
        prevEntry = prevEntry.nested;
      }
    } else {
      while (entry2.id === prevEntry.id && i < state.length - 1) {
        i += 1;
        prevEntry = state[i];
      }
    }
    const params = getAllEntryParams(state[i]);
    if (scrollToTop) {
      params.scrollToTop = true;
    } else {
      delete params.scrollToTop;
    }
    return getConfigById(prevEntry.id).url(params);
  }
  let entry = state[0];
  if (nested) {
    while (entry.nested) {
      entry = entry.nested;
    }
  }
  let config = getConfigById(entry.id).parent;
  if (config) {
    while (config && config.guard) {
      config = config.parent;
    }
    if (config) {
      return config.url(getAllEntryParams(state[0]));
    }
  }
  return "";
}
function getGuardUrl(params = {}) {
  const state = globalThis.history.state;
  if (!state)
    return "";
  const entry = state[0];
  if (entry.from) {
    const config2 = getConfigById(entry.from.id);
    return config2.url({...entry.from.params, ...params});
  }
  const config = getConfigById(entry.id);
  return config.stack[0] ? config.stack[0].url(params) : "";
}
function getCurrentUrl(params) {
  const state = globalThis.history.state;
  if (!state)
    return "";
  let entry = state[0];
  while (entry.nested)
    entry = entry.nested;
  const config = getConfigById(entry.id);
  return config.url({...entry.params, ...params});
}
function active(views, {stack: stack2 = false} = {}) {
  const state = globalThis.history.state;
  if (!state)
    return false;
  views = [].concat(views);
  return views.some((view) => {
    const config = configs2.get(view);
    if (!config) {
      throw TypeError(`Provided view is not connected to the router: ${view}`);
    }
    let entry = state[0];
    while (entry) {
      const target = getConfigById(entry.id);
      if (target === config || stack2 && hasInStack(config, target)) {
        return true;
      }
      entry = entry.nested;
    }
    return false;
  });
}
function getEntryFromURL(url) {
  let config;
  const [pathname, search] = url.hash.split("?");
  if (pathname && pathname.match(/^#@.+-.+/)) {
    config = getConfigById(pathname.split("@")[1]);
    url = new URL(`?${search}`, globalThis.location.origin);
  }
  if (!config) {
    for (const entryPoint of entryPoints) {
      const params = entryPoint.match(url);
      if (params)
        return entryPoint.getEntry(params);
    }
    return null;
  }
  return config.getEntry(config.match(url));
}
function handleNavigate(event) {
  if (event.defaultPrevented)
    return;
  let url;
  if (event.type === "click") {
    if (event.ctrlKey || event.metaKey)
      return;
    const anchorEl = event.composedPath().find((el) => el instanceof globalThis.HTMLAnchorElement);
    if (anchorEl) {
      url = new URL(anchorEl.href, globalThis.location.origin);
    }
  } else {
    url = new URL(event.target.action, globalThis.location.origin);
  }
  if (url && url.origin === globalThis.location.origin) {
    const entry = getEntryFromURL(url);
    if (entry) {
      event.preventDefault();
      dispatch(rootRouter, "navigate", {
        bubbles: true,
        detail: {entry, url}
      });
    }
  }
}
var activePromise;
function resolveEvent(event, promise) {
  event.preventDefault();
  activePromise = promise;
  const path = event.composedPath();
  const pseudoEvent = {
    type: event.type,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    target: event.target,
    defaultPrevented: false,
    preventDefault: () => {
    },
    composedPath: () => path
  };
  return promise.then(() => {
    if (promise === activePromise) {
      handleNavigate(pseudoEvent);
      activePromise = null;
    }
  });
}
function resolveStack(host, state, options) {
  let stack2 = stacks.get(host);
  const reducedState = [];
  for (const [index, entry] of state.entries()) {
    if (index === 0 || state[index - 1].id !== entry.id || getConfigById(entry.id).multiple) {
      reducedState.push(entry);
    }
  }
  const offset = stack2.length - reducedState.length;
  stack2 = reducedState.map((entry, index) => {
    const prevView = stack2[index + offset];
    const config = getConfigById(entry.id);
    let nextView;
    if (prevView) {
      const prevConfig = configs2.get(prevView);
      if (config.id !== prevConfig.id || index === 0 && config.replace) {
        return config.create();
      }
      nextView = prevView;
    } else {
      nextView = config.create();
    }
    return nextView;
  });
  stacks.set(host, stack2);
  const view = stack2[0];
  const flush = flushes.get(view);
  for (const [key2, value2] of Object.entries(state[0].params)) {
    if (key2 in view)
      view[key2] = value2;
  }
  for (const key2 of options.params) {
    if (key2 in view)
      view[key2] = host[key2];
  }
  if (flush)
    flush();
  return stack2;
}
function getEntryOffset(entry) {
  const state = [];
  for (let [index, e] of globalThis.history.state.entries()) {
    let i2 = 0;
    while (e) {
      state[i2] = state[i2] || [];
      state[i2][index] = e;
      e = e.nested;
      i2 += 1;
    }
  }
  let offset = 0;
  let i = 0;
  while (entry) {
    const config = getConfigById(entry.id);
    let j = offset;
    for (; j < state[i].length; j += 1) {
      const e = state[i][j];
      if (config.dialog) {
        if (e.id === entry.id)
          return j;
        continue;
      }
      if (e.id === entry.id) {
        if (config.multiple) {
          if (config.pathnameParams && config.pathnameParams.every((key2) => entry.params[key2] === e.params[key2]) || Object.entries(entry.params).every(([key2, value2]) => e.params[key2] === value2)) {
            offset = j;
            break;
          }
        } else {
          offset = j;
          break;
        }
      }
      const c = getConfigById(e.id);
      if (hasInStack(c, config)) {
        if (config.multiple && state[i][0].id === entry.id) {
          offset -= 1;
          break;
        }
        if (j > 0) {
          offset = j - 1;
          break;
        } else {
          return c.guard ? 0 : -1;
        }
      }
    }
    if (config.dialog)
      return -1;
    if (j === state[i].length) {
      offset = state[i].length - 1;
    }
    entry = entry.nested;
    i += 1;
  }
  return offset;
}
function setTransitionAttr(stack2, prevStack) {
  const el = globalThis.document.documentElement;
  if (stack2 && prevStack.length > 0) {
    let value2 = "";
    if (stack2.length > prevStack.length) {
      value2 = "forward";
      if (configs2.get(stack2[0].constructor).dialog) {
        value2 += " dialog";
      }
    } else if (stack2.length < prevStack.length) {
      value2 = "backward";
      if (configs2.get(prevStack[0].constructor).dialog) {
        value2 += " dialog";
      }
    } else if (stack2[0] !== prevStack[0]) {
      value2 = "replace";
    }
    el.setAttribute("router-transition", value2);
  } else {
    el.removeAttribute("router-transition");
  }
}
function connectRootRouter(host, invalidate2, options) {
  function flush() {
    const prevStack = stacks.get(host);
    const stack2 = resolveStack(host, globalThis.history.state, options);
    if (options.transition)
      setTransitionAttr(stack2, prevStack);
    invalidate2();
    const el = stack2[0];
    if (!configs2.get(el).dialog) {
      restoreLayout(el);
    }
  }
  function handlePopstate() {
    if (!globalThis.history.state) {
      const url = new URL(globalThis.location.href);
      const entry = getEntryFromURL(url);
      if (entry) {
        globalThis.removeEventListener("popstate", handlePopstate);
        globalThis.addEventListener("popstate", () => {
          globalThis.addEventListener("popstate", handlePopstate);
          navigate(entry);
        }, {once: true});
        globalThis.history.back();
      }
    } else {
      flush();
    }
  }
  function navigateBack(offset, entry, nextUrl) {
    const state2 = globalThis.history.state;
    const targetEntry = globalThis.history.state[offset];
    const pushOffset = offset < state2.length - 1 && state2.length > 2 ? 1 : 0;
    offset += pushOffset;
    if (targetEntry && entry.id === targetEntry.id) {
      entry = {...targetEntry, ...entry};
    }
    const replace = (popStateEvent) => {
      if (popStateEvent) {
        globalThis.removeEventListener("popstate", replace);
        globalThis.addEventListener("popstate", handlePopstate);
      }
      const method = pushOffset ? "pushState" : "replaceState";
      const nextState = [entry, ...state2.slice(offset + (pushOffset ? 0 : 1))];
      globalThis.history[method](nextState, "", nextUrl);
      flush();
    };
    if (offset) {
      globalThis.removeEventListener("popstate", handlePopstate);
      globalThis.addEventListener("popstate", replace);
      globalThis.history.go(-offset);
    } else {
      saveLayout();
      replace();
    }
  }
  function navigate(entry) {
    const state2 = globalThis.history.state;
    let nestedEntry = entry;
    while (nestedEntry.nested)
      nestedEntry = nestedEntry.nested;
    const nestedConfig = getConfigById(nestedEntry.id);
    const url = nestedConfig.browserUrl ? nestedConfig.url(nestedEntry.params, true) : options.url;
    const offset = getEntryOffset(entry);
    if (offset > -1) {
      navigateBack(offset, entry, url);
    } else {
      saveLayout();
      globalThis.history.scrollRestoration = "manual";
      globalThis.history.pushState([entry, ...state2], "", url);
      flush();
    }
  }
  function executeNavigate(event) {
    navigate(event.detail.entry);
  }
  if (rootRouter) {
    throw Error(`An element with root router already connected to the document: <${rootRouter.tagName.toLowerCase()}>`);
  }
  let roots;
  try {
    roots = setupViews(options.views, options);
    rootRouter = host;
    flushes.set(host, flush);
  } catch (e) {
    console.error(`Error while connecting router in <${host.tagName.toLowerCase()}>:`);
    throw e;
  }
  const state = globalThis.history.state;
  const bootstrapURL = new URL(globalThis.location.href);
  if (!state) {
    const entry = getEntryFromURL(bootstrapURL) || roots[0].getEntry();
    globalThis.history.replaceState([entry], "", options.url);
    flush();
  } else {
    const stack2 = stacks.get(host);
    let i;
    for (i = state.length - 1; i >= 0; i -= 1) {
      let entry = state[i];
      while (entry) {
        const config = getConfigById(entry.id);
        if (!config || config.dialog && stack2.length === 0 || !roots.includes(config) && !roots.some((c) => hasInStack(c, config))) {
          break;
        }
        entry = entry.nested;
      }
      if (entry)
        break;
    }
    if (i > -1) {
      const lastValidEntry = state[i + 1];
      navigateBack(state.length - i - 1, lastValidEntry || roots[0].getEntry(state[0].params), options.url);
    } else {
      let entry = state[0];
      while (entry.nested)
        entry = entry.nested;
      const nestedConfig = getConfigById(entry.id);
      const resultEntry = nestedConfig.getEntry(entry.params);
      navigate(resultEntry);
    }
  }
  globalThis.addEventListener("popstate", handlePopstate);
  host.addEventListener("click", handleNavigate);
  host.addEventListener("submit", handleNavigate);
  host.addEventListener("navigate", executeNavigate);
  return () => {
    globalThis.removeEventListener("popstate", handlePopstate);
    host.removeEventListener("click", handleNavigate);
    host.removeEventListener("submit", handleNavigate);
    host.removeEventListener("navigate", executeNavigate);
    setTransitionAttr(null);
    entryPoints.clear();
    rootRouter = null;
    const length = globalThis.history.state && globalThis.history.state.length;
    if (length > 1) {
      globalThis.history.go(1 - length);
      globalThis.history.replaceState(state, "", bootstrapURL);
    }
  };
}
function connectNestedRouter(host, invalidate2, options) {
  const config = configs2.get(host);
  function getNestedState() {
    return globalThis.history.state.map((entry) => {
      while (entry) {
        if (entry.id === config.id)
          return entry.nested;
        entry = entry.nested;
      }
      return entry;
    }).filter((e) => e);
  }
  function flush() {
    resolveStack(host, getNestedState(), options);
    invalidate2();
  }
  if (!getNestedState()[0]) {
    const state = globalThis.history.state;
    globalThis.history.replaceState([config.nestedRoots[0].getEntry(state[0].params), ...state.slice(1)], "");
  }
  flush();
  flushes.set(host, flush);
}
function router(views, options) {
  options = {
    url: globalThis.location.href.replace(/#.*$/, ""),
    params: [],
    ...options,
    views
  };
  const desc = {
    value: (host) => {
      const stack2 = stacks.get(host) || [];
      return stack2.slice(0, stack2.findIndex((el) => !configs2.get(el).dialog) + 1).reverse();
    },
    connect: (host, _, invalidate2) => {
      for (const param of options.params) {
        if (!(param in host)) {
          throw Error(`Property '${param}' for global parameters is not defined in <${host.tagName.toLowerCase()}>`);
        }
      }
      if (!stacks.has(host))
        stacks.set(host, []);
      if (configs2.has(host)) {
        return connectNestedRouter(host, invalidate2, options);
      }
      return connectRootRouter(host, invalidate2, options);
    },
    observe: isDebugMode() && ((host, value2, lastValue) => {
      const index = value2.length - 1;
      const view = value2[index];
      if (lastValue && view === lastValue[index])
        return;
      let config = configs2.get(host);
      let entry = globalThis.history.state[0];
      let key2 = 0;
      while (config) {
        key2 += 1;
        entry = entry.nested;
        config = config.nestedParent;
      }
      console.groupCollapsed(`[${host.tagName.toLowerCase()}]: navigated to <${entry.id}> ($$${key2})`);
      for (const [k, v] of Object.entries(entry.params)) {
        console.log(`%c${k}:`, "font-weight: bold", v);
      }
      console.groupEnd();
      globalThis[`$$${key2}`] = view;
    })
  };
  routers.set(desc, options);
  return desc;
}
var router_default = Object.freeze(Object.assign(router, {
  connect: connect2,
  debug,
  url: getUrl,
  backUrl: getBackUrl,
  guardUrl: getGuardUrl,
  currentUrl: getCurrentUrl,
  resolve: resolveEvent,
  active
}));

// node_modules/hybrids/src/template/utils.js
var metaMap = new WeakMap();
function getMeta(key2) {
  let value2 = metaMap.get(key2);
  if (value2)
    return value2;
  metaMap.set(key2, value2 = {});
  return value2;
}
function getTemplateEnd(node) {
  let meta;
  while (node && (meta = getMeta(node)) && meta.endNode) {
    node = meta.endNode;
  }
  return node;
}
function removeTemplate(target) {
  if (target.nodeType === globalThis.Node.TEXT_NODE) {
    const data = metaMap.get(target);
    if (data && data.startNode) {
      const endNode = getTemplateEnd(data.endNode);
      let node = data.startNode;
      const lastNextSibling = endNode.nextSibling;
      while (node) {
        const nextSibling = node.nextSibling;
        node.parentNode.removeChild(node);
        node = nextSibling !== lastNextSibling && nextSibling;
      }
      metaMap.set(target, {});
    }
  } else {
    let child = target.childNodes[0];
    while (child) {
      target.removeChild(child);
      child = target.childNodes[0];
    }
    metaMap.set(target, {});
  }
}
var TIMESTAMP = Date.now();
var getPlaceholder = (id = 0) => `H-${TIMESTAMP}-${id}`;

// node_modules/hybrids/src/template/layout.js
var NUMBER_REGEXP = /^\d+$/;
var rules = {
  block: (props, align) => ({
    display: "block",
    "text-align": align
  }),
  inline: ({display}) => ({
    display: `inline${display ? `-${display}` : ""}`
  }),
  contents: {display: "contents"},
  hidden: {display: "none"},
  ...["row", "row-reverse", "column", "column-reverse"].reduce((acc, type) => {
    acc[type] = (props, wrap = "nowrap") => ({
      display: "flex",
      "flex-flow": `${type} ${wrap}`
    });
    return acc;
  }, {}),
  grow: (props, value2 = 1) => ({"flex-grow": value2}),
  shrink: (props, value2 = 1) => ({"flex-shrink": value2}),
  basis: (props, value2) => ({"flex-basis": dimension(value2)}),
  order: (props, value2 = 0) => ({order: value2}),
  grid: (props, columns = "1", rows = "", autoFlow = "", dense = "") => ({
    display: "grid",
    ...["columns", "rows"].reduce((acc, type) => {
      const value2 = type === "columns" ? columns : rows;
      acc[`grid-template-${type}`] = value2 && value2.split("|").map((v) => v.match(NUMBER_REGEXP) ? `repeat(${v}, minmax(0, 1fr))` : dimension(v)).join(" ");
      return acc;
    }, {}),
    "grid-auto-flow": `${autoFlow} ${dense && "dense"}`
  }),
  area: (props, column = "", row = "") => ({
    "grid-column": column.match(NUMBER_REGEXP) ? `span ${column}` : column,
    "grid-row": row.match(NUMBER_REGEXP) ? `span ${row}` : row
  }),
  gap: (props, column = 1, row = "") => ({
    "column-gap": dimension(column),
    "row-gap": dimension(row || column)
  }),
  items: (props, v1 = "start", v2 = "") => ({
    "place-items": `${v1} ${v2}`
  }),
  content: (props, v1 = "start", v2 = "") => ({
    "place-content": `${v1} ${v2}`
  }),
  self: (props, v1 = "start", v2 = "") => ({
    "place-self": `${v1} ${v2}`
  }),
  center: {"place-items": "center", "place-content": "center"},
  size: (props, width, height = width) => ({
    width: dimension(width),
    height: dimension(height),
    "box-sizing": "border-box"
  }),
  width: (props, base, min, max) => ({
    width: dimension(base),
    "min-width": dimension(min),
    "max-width": dimension(max),
    "box-sizing": "border-box"
  }),
  height: (props, base, min, max) => ({
    height: dimension(base),
    "min-height": dimension(min),
    "max-height": dimension(max),
    "box-sizing": "border-box"
  }),
  ratio: (props, v1) => ({"aspect-ratio": v1}),
  overflow: (props, v1 = "hidden", v2 = "") => {
    const type = v2 ? `-${v1}` : "";
    const value2 = v2 ? v2 : v1;
    return {
      [`overflow${type}`]: value2,
      ...value2 === "scroll" ? {
        "flex-grow": props["flex-grow"] || 1,
        "flex-basis": 0,
        "overscroll-behavior": "contain",
        "--webkit-overflow-scrolling": "touch"
      } : {}
    };
  },
  margin: (props, v1 = "1", v2, v3, v4) => {
    if (v1.match(/top|bottom|left|right/)) {
      return {
        [`margin-${v1}`]: dimension(v2 || "1")
      };
    }
    return {
      margin: `${dimension(v1)} ${dimension(v2)} ${dimension(v3)} ${dimension(v4)}`
    };
  },
  padding: (props, v1 = "1", v2, v3, v4) => {
    if (v1.match(/top|bottom|left|right/)) {
      return {
        [`padding-${v1}`]: dimension(v2 || "1")
      };
    }
    return {
      padding: `${dimension(v1)} ${dimension(v2)} ${dimension(v3)} ${dimension(v4)}`
    };
  },
  absolute: {position: "absolute"},
  relative: {position: "relative"},
  fixed: {position: "fixed"},
  sticky: {position: "sticky"},
  static: {position: "static"},
  inset: (props, value2 = 0) => {
    const d = dimension(value2);
    return {top: d, right: d, bottom: d, left: d};
  },
  top: (props, value2 = 0) => ({top: dimension(value2)}),
  bottom: (props, value2 = 0) => ({bottom: dimension(value2)}),
  left: (props, value2 = 0) => ({left: dimension(value2)}),
  right: (props, value2 = 0) => ({right: dimension(value2)}),
  layer: (props, value2 = 1) => ({"z-index": value2}),
  "": (props, _, ...args) => {
    if (args.length < 2) {
      throw new Error("Generic rule '::' requires at least two arguments, eg.: ::[property]:[name]");
    }
    return {
      [args[args.length - 2]]: `var(--${args.join("-")})`
    };
  },
  view: (props, value2) => ({"view-transition-name": value2})
};
var dimensions = {
  min: "min-content",
  max: "max-content",
  fit: "fit-content",
  full: "100%"
};
var queries = {
  print: "print",
  portrait: "(orientation: portrait)",
  landscape: "(orientation: landscape)",
  hover: "(hover: hover)",
  "any-hover": "(any-hover: hover)"
};
function dimension(value2) {
  value2 = dimensions[value2] || value2;
  if (/^-?\d+(\.\d+)*$/.test(String(value2))) {
    return `${value2 * 8}px`;
  }
  return value2 || "";
}
var hasAdoptedStylesheets = !!(globalThis.document && globalThis.document.adoptedStyleSheets);
var globalSheet;
function getCSSStyleSheet() {
  if (globalSheet)
    return globalSheet;
  if (hasAdoptedStylesheets) {
    globalSheet = new globalThis.CSSStyleSheet();
  } else {
    const el = globalThis.document.createElement("style");
    el.appendChild(globalThis.document.createTextNode(""));
    globalThis.document.head.appendChild(el);
    globalSheet = el.sheet;
  }
  globalSheet.insertRule(":host([hidden]) { display: none; }");
  return globalSheet;
}
var styleElements = new WeakMap();
var injectedTargets = new WeakSet();
function inject(target) {
  const root = target.getRootNode();
  if (injectedTargets.has(root))
    return;
  const sheet = getCSSStyleSheet();
  if (hasAdoptedStylesheets && root.adoptedStyleSheets) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } else {
    if (root === globalThis.document)
      return;
    let el = styleElements.get(root);
    if (!el) {
      el = globalThis.document.createElement("style");
      root.appendChild(el);
      styleElements.set(root, el);
    }
    let result = "";
    for (let i = 0; i < sheet.cssRules.length; i++) {
      result += sheet.cssRules[i].cssText;
    }
    el.textContent = result;
  }
  injectedTargets.add(root);
}
var classNames = new Map();
function insertRule(node, query, tokens, hostMode) {
  let className = classNames.get(node);
  if (!className) {
    className = `l-${Math.random().toString(36).substr(2, 5)}`;
    classNames.set(node, className);
  }
  if (!hasAdoptedStylesheets)
    injectedTargets = new WeakSet();
  const sheet = getCSSStyleSheet();
  const [selectors, mediaQueries = ""] = query.split("@");
  const cssRules = Object.entries(tokens.replace(/\s+/g, " ").trim().split(" ").reduce((acc, token) => {
    const [id, ...args] = token.split(":");
    const rule = rules[id];
    if (!rule) {
      throw TypeError(`Unsupported layout rule: '${id}'`);
    }
    return Object.assign(acc, typeof rule === "function" ? rule(acc, ...args.map((v) => v.match(/--.*/) ? `var(${v})` : v)) : rule);
  }, {})).reduce((acc, [key2, value2]) => value2 !== void 0 && value2 !== "" ? acc + `${key2}: ${value2};` : acc, "");
  const mediaSelector = mediaQueries.split(":").map((query2) => query2.split("|").map((q) => q && (queries[q] || `(min-width: ${q})`)).join(" and ")).join(", ");
  if (hostMode) {
    const shadowSelector = `:host(:where(.${className}-s${selectors}))`;
    const contentSelector = `:where(.${className}-c${selectors})`;
    [shadowSelector, contentSelector].forEach((selector) => {
      sheet.insertRule(mediaSelector ? `@media ${mediaSelector} { ${selector} { ${cssRules} } }` : `${selector} { ${cssRules} }`, sheet.cssRules.length - 1);
    });
  } else {
    const selector = `.${className}${selectors}`;
    sheet.insertRule(mediaSelector ? `@media ${mediaSelector} { ${selector} { ${cssRules} } }` : `${selector} { ${cssRules} }`, sheet.cssRules.length - 1);
  }
  return className;
}

// node_modules/hybrids/src/template/resolvers/array.js
var arrayMap = new WeakMap();
function movePlaceholder(target, previousSibling) {
  const meta = getMeta(target);
  const startNode = meta.startNode;
  const endNode = getTemplateEnd(meta.endNode);
  previousSibling.parentNode.insertBefore(target, previousSibling.nextSibling);
  let prevNode = target;
  let node = startNode;
  while (node) {
    const nextNode = node.nextSibling;
    prevNode.parentNode.insertBefore(node, prevNode.nextSibling);
    prevNode = node;
    node = nextNode !== endNode.nextSibling && nextNode;
  }
}
function resolveArray(host, target, value2, resolveValue3, useLayout) {
  let lastEntries = arrayMap.get(target);
  const entries2 = value2.map((item, index) => ({
    id: hasOwnProperty.call(item, "id") ? item.id : index,
    value: item,
    placeholder: null,
    available: true
  }));
  arrayMap.set(target, entries2);
  if (lastEntries) {
    const ids = new Set();
    for (const entry of entries2) {
      ids.add(entry.id);
    }
    lastEntries = lastEntries.filter((entry) => {
      if (!ids.has(entry.id)) {
        removeTemplate(entry.placeholder);
        entry.placeholder.parentNode.removeChild(entry.placeholder);
        return false;
      }
      return true;
    });
  }
  let previousSibling = target;
  const lastIndex = value2.length - 1;
  const meta = getMeta(target);
  for (let index = 0; index < entries2.length; index += 1) {
    const entry = entries2[index];
    let matchedEntry;
    if (lastEntries) {
      for (let i = 0; i < lastEntries.length; i += 1) {
        if (lastEntries[i].available && lastEntries[i].id === entry.id) {
          matchedEntry = lastEntries[i];
          break;
        }
      }
    }
    if (matchedEntry) {
      matchedEntry.available = false;
      entry.placeholder = matchedEntry.placeholder;
      if (entry.placeholder.previousSibling !== previousSibling) {
        movePlaceholder(entry.placeholder, previousSibling);
      }
      if (matchedEntry.value !== entry.value) {
        resolveValue3(host, entry.placeholder, entry.value, matchedEntry.value, useLayout);
      }
    } else {
      entry.placeholder = globalThis.document.createTextNode("");
      previousSibling.parentNode.insertBefore(entry.placeholder, previousSibling.nextSibling);
      resolveValue3(host, entry.placeholder, entry.value, void 0, useLayout);
    }
    previousSibling = getTemplateEnd(getMeta(entry.placeholder, {}).endNode || entry.placeholder);
    if (index === 0)
      meta.startNode = entry.placeholder;
    if (index === lastIndex)
      meta.endNode = previousSibling;
  }
  if (lastEntries) {
    for (const entry of lastEntries) {
      if (entry.available) {
        removeTemplate(entry.placeholder);
        entry.placeholder.parentNode.removeChild(entry.placeholder);
      }
    }
  }
}

// node_modules/hybrids/src/template/resolvers/node.js
function resolveNode(host, target, value2) {
  removeTemplate(target);
  const meta = getMeta(target);
  meta.startNode = meta.endNode = value2;
  target.parentNode.insertBefore(value2, target.nextSibling);
}

// node_modules/hybrids/src/template/resolvers/value.js
function typeOf(value2) {
  const type = typeof value2;
  if (type === "object") {
    if (Array.isArray(value2))
      return "array";
    if (value2 instanceof globalThis.Node)
      return "node";
  }
  return type;
}
function resolveValue(host, target, value2, lastValue, useLayout) {
  const type = typeOf(value2);
  const lastType = typeOf(lastValue);
  if (lastType !== "undefined" && type !== lastType) {
    if (type !== "function")
      removeTemplate(target);
    if (lastType === "array") {
      arrayMap.delete(target);
    } else if (lastType !== "node" && lastType !== "function") {
      target.textContent = "";
    }
  }
  switch (type) {
    case "array":
      resolveArray(host, target, value2, resolveValue, useLayout);
      break;
    case "node":
      resolveNode(host, target, value2);
      break;
    case "function":
      if (useLayout)
        value2.useLayout = true;
      value2(host, target);
      break;
    default:
      target.textContent = type === "number" || value2 ? value2 : "";
  }
}

// node_modules/hybrids/src/template/resolvers/event.js
var targets2 = new WeakMap();
function resolveEventListener(eventType) {
  return (host, target, value2, lastValue) => {
    if (lastValue) {
      const eventMap = targets2.get(target);
      target.removeEventListener(eventType, eventMap.get(lastValue), lastValue.options !== void 0 ? lastValue.options : false);
    }
    if (value2) {
      if (typeof value2 !== "function") {
        throw Error(`Event listener must be a function: ${typeof value2}`);
      }
      let eventMap = targets2.get(target);
      if (!eventMap) {
        eventMap = new WeakMap();
        targets2.set(target, eventMap);
      }
      const callback = value2.bind(null, host);
      eventMap.set(value2, callback);
      target.addEventListener(eventType, callback, value2.options !== void 0 ? value2.options : false);
    }
  };
}

// node_modules/hybrids/src/template/resolvers/class.js
function addClassNames(set4, value2) {
  if (value2) {
    for (const className of String(value2).split(/\s+/)) {
      if (className)
        set4.add(className);
    }
  }
}
function normalizeValue(value2) {
  const set4 = new Set();
  if (Array.isArray(value2)) {
    for (const v of value2) {
      addClassNames(set4, v);
    }
  } else if (value2 !== null && typeof value2 === "object") {
    for (const [v, condition] of Object.entries(value2)) {
      if (v && condition)
        addClassNames(set4, v);
    }
  } else {
    addClassNames(set4, value2);
  }
  return set4;
}
var classMap = new WeakMap();
function resolveClassList(host, target, value2) {
  const previousList = classMap.get(target) || new Set();
  const list = normalizeValue(value2);
  classMap.set(target, list);
  for (const className of list) {
    target.classList.add(className);
    previousList.delete(className);
  }
  for (const className of previousList) {
    target.classList.remove(className);
  }
}

// node_modules/hybrids/src/template/resolvers/style.js
var styleMap = new WeakMap();
function resolveStyle(host, target, value2) {
  if (value2 === null || typeof value2 !== "object") {
    throw TypeError(`Style value must be an object in ${stringifyElement(target)}:`, value2);
  }
  const previousMap = styleMap.get(target) || new Map();
  const nextMap = new Map();
  for (const key2 of Object.keys(value2)) {
    const dashKey = camelToDash(key2);
    const styleValue = value2[key2];
    if (!styleValue && styleValue !== 0) {
      target.style.removeProperty(dashKey);
    } else {
      target.style.setProperty(dashKey, styleValue);
    }
    nextMap.set(dashKey, styleValue);
    previousMap.delete(dashKey);
  }
  for (const key2 of previousMap.keys()) {
    target.style[key2] = "";
  }
  styleMap.set(target, nextMap);
}

// node_modules/hybrids/src/template/resolvers/property.js
function updateAttr(target, attrName, value2) {
  if (value2 === false || value2 === void 0 || value2 === null) {
    target.removeAttribute(attrName);
  } else {
    const attrValue = value2 === true ? "" : String(value2);
    target.setAttribute(attrName, attrValue);
  }
}
function resolveProperty(attrName, propertyName, isSVG) {
  if (propertyName.substr(0, 2) === "on") {
    const eventType = propertyName.substr(2);
    return resolveEventListener(eventType);
  }
  switch (attrName) {
    case "class":
      return resolveClassList;
    case "style":
      return resolveStyle;
    default: {
      if (isSVG) {
        return (host, target, value2) => {
          updateAttr(target, attrName, value2);
        };
      }
      let isProp = void 0;
      return (host, target, value2) => {
        if (isProp === void 0) {
          isProp = target.tagName !== "svg";
          if (isProp) {
            isProp = propertyName in target;
            if (!isProp) {
              propertyName = attrName.replace(/-./g, (match) => match[1].toUpperCase());
              isProp = propertyName in target;
            }
          }
        }
        if (isProp) {
          target[propertyName] = value2;
        } else {
          updateAttr(target, attrName, value2);
        }
      };
    }
  }
}

// node_modules/hybrids/src/template/core.js
var PLACEHOLDER_REGEXP_TEXT = getPlaceholder("(\\d+)");
var PLACEHOLDER_REGEXP_EQUAL = new RegExp(`^${PLACEHOLDER_REGEXP_TEXT}$`);
var PLACEHOLDER_REGEXP_ALL = new RegExp(PLACEHOLDER_REGEXP_TEXT, "g");
var PLACEHOLDER_REGEXP_ONLY = /^[^A-Za-z]+$/;
var PLACEHOLDER_REGEXP_MSG = new RegExp(getPlaceholder("") + "\\d+");
function createContents(parts) {
  let signature = parts[0];
  let tableMode = false;
  for (let index = 1; index < parts.length; index += 1) {
    tableMode = tableMode || signature.match(/<\s*(table|th|tr|td|thead|tbody|tfoot|caption|colgroup)([^<>]|"[^"]*"|'[^']*')*>\s*$/);
    signature += (tableMode ? `<!--${getPlaceholder(index - 1)}-->` : getPlaceholder(index - 1)) + parts[index];
    tableMode = tableMode && !signature.match(/<\/\s*(table|th|tr|td|thead|tbody|tfoot|caption|colgroup)\s*>/);
  }
  return signature;
}
function getPropertyName(string) {
  return string.replace(/\s*=\s*['"]*$/g, "").split(/\s+/).pop();
}
function createWalker(context2) {
  return globalThis.document.createTreeWalker(context2, globalThis.NodeFilter.SHOW_ELEMENT | globalThis.NodeFilter.SHOW_TEXT | globalThis.NodeFilter.SHOW_COMMENT, null, false);
}
function normalizeWhitespace(input, startIndent = 0) {
  input = input.replace(/(^[\n\s\t ]+)|([\n\s\t ]+$)+/g, "");
  let i = input.indexOf("\n");
  if (i > -1) {
    let indent = 0 - startIndent - 2;
    for (i += 1; input[i] === " " && i < input.length; i += 1) {
      indent += 1;
    }
    return input.replace(/\n +/g, (t) => t.substr(0, Math.max(t.length - indent, 1)));
  }
  return input;
}
function beautifyTemplateLog(input, index) {
  const placeholder = getPlaceholder(index);
  const output = normalizeWhitespace(input).split("\n").filter((i) => i).map((line) => {
    const startIndex = line.indexOf(placeholder);
    if (startIndex > -1) {
      return `| ${line}
--${"-".repeat(startIndex)}${"^".repeat(6)}`;
    }
    return `| ${line}`;
  }).join("\n").replace(PLACEHOLDER_REGEXP_ALL, "${...}");
  return `${output}`;
}
var styleSheetsMap = new Map();
var prevStylesMap = new WeakMap();
var prevStyleSheetsMap = new WeakMap();
function updateAdoptedStylesheets(target, styles) {
  const prevStyles = prevStylesMap.get(target);
  if (!prevStyles && !styles || styles?.length && prevStyles?.length && styles?.every((s, i) => prevStyles[i] === s)) {
    return;
  }
  let styleSheets = null;
  if (styles) {
    styleSheets = [];
    for (const style2 of styles) {
      let styleSheet = style2;
      if (!(styleSheet instanceof globalThis.CSSStyleSheet)) {
        styleSheet = styleSheetsMap.get(style2);
        if (!styleSheet) {
          styleSheet = new globalThis.CSSStyleSheet();
          styleSheet.replaceSync(style2);
          styleSheetsMap.set(style2, styleSheet);
        }
      }
      styleSheets.push(styleSheet);
    }
  }
  let adoptedStyleSheets;
  const prevStyleSheets = prevStyleSheetsMap.get(target);
  if (prevStyleSheets) {
    adoptedStyleSheets = [];
    for (const styleSheet of target.adoptedStyleSheets) {
      if (!prevStyleSheets.includes(styleSheet)) {
        adoptedStyleSheets.push(styleSheet);
      }
    }
  }
  if (styleSheets) {
    adoptedStyleSheets = adoptedStyleSheets || target.adoptedStyleSheets.length ? [...target.adoptedStyleSheets] : [];
    for (const styleSheet of styleSheets) {
      adoptedStyleSheets.push(styleSheet);
    }
  }
  target.adoptedStyleSheets = adoptedStyleSheets;
  prevStylesMap.set(target, styles);
  prevStyleSheetsMap.set(target, styleSheets);
}
var styleElementMap = new WeakMap();
function updateStyleElement(target, styles) {
  let styleEl = styleElementMap.get(target);
  if (styles) {
    const prevStyles = prevStylesMap.get(target);
    if (prevStyles && styles.every((s, i) => prevStyles[i] === s))
      return;
    if (!styleEl || styleEl.parentNode !== target) {
      styleEl = globalThis.document.createElement("style");
      styleElementMap.set(target, styleEl);
      target = getTemplateEnd(target);
      if (target.nodeType === globalThis.Node.TEXT_NODE) {
        target.parentNode.insertBefore(styleEl, target.nextSibling);
      } else {
        target.appendChild(styleEl);
      }
    }
    styleEl.textContent = styles.join("\n/*------*/\n");
    prevStylesMap.set(target, styles);
  } else if (styleEl) {
    styleEl.parentNode.removeChild(styleEl);
    styleElementMap.set(target, null);
  }
}
function compileTemplate(rawParts, isSVG, isMsg, useLayout) {
  let contents = "";
  if (isMsg) {
    contents = rawParts;
    rawParts = rawParts.split(PLACEHOLDER_REGEXP_MSG);
  } else {
    contents = createContents(rawParts);
  }
  let template = globalThis.document.createElement("template");
  if (isSVG) {
    template.innerHTML = `<svg>${contents}</svg>`;
    const svgRoot = template.content.firstChild;
    template.content.removeChild(svgRoot);
    for (const node of Array.from(svgRoot.childNodes)) {
      template.content.appendChild(node);
    }
  } else {
    template.innerHTML = contents;
  }
  let hostLayout;
  const layoutTemplate = template.content.children[0];
  if (layoutTemplate instanceof globalThis.HTMLTemplateElement) {
    for (const attr of Array.from(layoutTemplate.attributes)) {
      const value2 = attr.value.trim();
      if (value2 && attr.name.startsWith("layout")) {
        if (value2.match(PLACEHOLDER_REGEXP_ALL)) {
          throw Error("Layout attribute cannot contain expressions");
        }
        hostLayout = insertRule(layoutTemplate, attr.name.substr(6), value2, true);
      }
    }
    if (hostLayout !== void 0 && template.content.children.length > 1) {
      throw Error("Template, which uses layout system must have only the '<template>' root element");
    }
    useLayout = hostLayout || layoutTemplate.hasAttribute("layout");
    template = layoutTemplate;
  }
  const compileWalker = createWalker(template.content);
  const parts = {};
  const notDefinedElements = [];
  let compileIndex = 0;
  let noTranslate = null;
  let useShadow = false;
  let slotDetected = false;
  while (compileWalker.nextNode()) {
    let node = compileWalker.currentNode;
    if (noTranslate && !noTranslate.contains(node)) {
      noTranslate = null;
    }
    if (node.nodeType === globalThis.Node.COMMENT_NODE) {
      if (PLACEHOLDER_REGEXP_EQUAL.test(node.textContent)) {
        node.parentNode.insertBefore(globalThis.document.createTextNode(node.textContent), node.nextSibling);
        compileWalker.nextNode();
        node.parentNode.removeChild(node);
        node = compileWalker.currentNode;
      }
    }
    if (node.nodeType === globalThis.Node.TEXT_NODE) {
      let text = node.textContent;
      const equal = text.match(PLACEHOLDER_REGEXP_EQUAL);
      if (equal) {
        node.textContent = "";
        parts[equal[1]] = [compileIndex, resolveValue];
      } else {
        if (isLocalizeEnabled() && !isMsg && !noTranslate && !text.match(/^\s*$/)) {
          let offset;
          const key2 = text.trim();
          const localizedKey = key2.replace(/\s+/g, " ").replace(PLACEHOLDER_REGEXP_ALL, (_, index) => {
            index = Number(index);
            if (offset === void 0)
              offset = index;
            return `\${${index - offset}}`;
          });
          if (!localizedKey.match(PLACEHOLDER_REGEXP_ONLY)) {
            let context2 = node.previousSibling && node.previousSibling.nodeType === globalThis.Node.COMMENT_NODE ? node.previousSibling : "";
            if (context2) {
              context2.parentNode.removeChild(context2);
              compileIndex -= 1;
              context2 = (context2.textContent.split("|")[1] || "").trim().replace(/\s+/g, " ");
            }
            const resultKey = get3(localizedKey, context2).replace(/\${(\d+)}/g, (_, index) => getPlaceholder(Number(index) + offset));
            text = text.replace(key2, resultKey);
            node.textContent = text;
          }
        }
        const results = text.match(PLACEHOLDER_REGEXP_ALL);
        if (results) {
          let currentNode = node;
          results.reduce((acc, placeholder) => {
            const [before, next] = acc.pop().split(placeholder);
            if (before)
              acc.push(before);
            acc.push(placeholder);
            if (next)
              acc.push(next);
            return acc;
          }, [text]).forEach((part, index) => {
            if (index === 0) {
              currentNode.textContent = part;
            } else {
              currentNode = currentNode.parentNode.insertBefore(globalThis.document.createTextNode(part), currentNode.nextSibling);
              compileWalker.currentNode = currentNode;
              compileIndex += 1;
            }
            const equal2 = currentNode.textContent.match(PLACEHOLDER_REGEXP_EQUAL);
            if (equal2) {
              currentNode.textContent = "";
              parts[equal2[1]] = [compileIndex, resolveValue];
            }
          });
        }
      }
    } else {
      if (node.nodeType === globalThis.Node.ELEMENT_NODE) {
        if (node.tagName === "STYLE" || node.tagName === "SLOT" || node.tagName === "LINK" && node.rel === "stylesheet") {
          useShadow = true;
          slotDetected = slotDetected || node.tagName === "SLOT";
        }
        if (!noTranslate && (node.getAttribute("translate") === "no" || node.tagName.toLowerCase() === "script" || node.tagName.toLowerCase() === "style")) {
          noTranslate = node;
        }
        const tagName = node.tagName.toLowerCase();
        if (tagName.match(/.+-.+/) && !globalThis.customElements.get(tagName) && !notDefinedElements.includes(tagName)) {
          notDefinedElements.push(tagName);
        }
        for (const attr of Array.from(node.attributes)) {
          const value2 = attr.value.trim();
          const name = attr.name;
          if (useLayout && name.startsWith("layout") && value2) {
            if (value2.match(PLACEHOLDER_REGEXP_ALL)) {
              throw Error("Layout attribute cannot contain expressions");
            }
            const className = insertRule(node, name.substr(6), value2);
            node.removeAttribute(name);
            node.classList.add(className);
            continue;
          }
          const equal = value2.match(PLACEHOLDER_REGEXP_EQUAL);
          if (equal) {
            const propertyName = getPropertyName(rawParts[equal[1]]);
            parts[equal[1]] = [
              compileIndex,
              resolveProperty(name, propertyName, isSVG)
            ];
            node.removeAttribute(attr.name);
          } else {
            const results = value2.match(PLACEHOLDER_REGEXP_ALL);
            if (results) {
              const partialName = `attr__${name}`;
              for (const [index, placeholder] of results.entries()) {
                const [, id] = placeholder.match(PLACEHOLDER_REGEXP_EQUAL);
                let isProp = false;
                parts[id] = [
                  compileIndex,
                  (host, target, attrValue) => {
                    const meta = getMeta(target);
                    meta[partialName] = (meta[partialName] || value2).replace(placeholder, attrValue ?? "");
                    if (results.length === 1 || index + 1 === results.length) {
                      isProp = isProp || !isSVG && !(target instanceof globalThis.SVGElement) && name in target;
                      if (isProp) {
                        target[name] = meta[partialName];
                      } else {
                        target.setAttribute(name, meta[partialName]);
                      }
                      meta[partialName] = void 0;
                    }
                  },
                  true
                ];
              }
              attr.value = "";
            }
          }
        }
      }
    }
    compileIndex += 1;
  }
  if (notDefinedElements.length) {
    console.warn(`Not defined ${notDefinedElements.map((e) => `<${e}>`).join(", ")} element${notDefinedElements.length > 1 ? "s" : ""} found in the template:
${beautifyTemplateLog(contents, -1)}`);
  }
  const partsKeys = Object.keys(parts);
  return function updateTemplateInstance(host, target, args, styleSheets) {
    if (target) {
      if (slotDetected && !host.shadowRoot) {
        throw TypeError(`The <slot> element found - use 'shadow' options to explicitly define Shadow DOM mode`);
      }
    } else {
      target = host.shadowRoot || (useShadow || styleSheets) && host.attachShadow({mode: "open"}) || host;
    }
    let meta = getMeta(target);
    if (template !== meta.template) {
      const fragment = globalThis.document.importNode(template.content, true);
      const renderWalker = createWalker(fragment);
      const markers = [];
      let renderIndex = 0;
      let keyIndex = 0;
      let currentPart = parts[partsKeys[keyIndex]];
      while (renderWalker.nextNode()) {
        const node = renderWalker.currentNode;
        while (currentPart && currentPart[0] === renderIndex) {
          markers.push({
            index: partsKeys[keyIndex],
            node,
            fn: currentPart[1],
            forceUpdate: currentPart[2]
          });
          keyIndex += 1;
          currentPart = parts[partsKeys[keyIndex]];
        }
        renderIndex += 1;
      }
      if (meta.hostLayout) {
        host.classList.remove(meta.hostLayout);
      }
      removeTemplate(target);
      meta = getMeta(target);
      meta.template = template;
      meta.markers = markers;
      if (target.nodeType === globalThis.Node.TEXT_NODE) {
        updateStyleElement(target);
        meta.startNode = fragment.childNodes[0];
        meta.endNode = fragment.childNodes[fragment.childNodes.length - 1];
        let previousChild = target;
        let child = fragment.childNodes[0];
        while (child) {
          target.parentNode.insertBefore(child, previousChild.nextSibling);
          previousChild = child;
          child = fragment.childNodes[0];
        }
      } else {
        if (useLayout && hostLayout) {
          const className = `${hostLayout}-${host === target ? "c" : "s"}`;
          host.classList.add(className);
          meta.hostLayout = className;
        }
        target.appendChild(fragment);
      }
      if (useLayout)
        inject(target);
    }
    if (target.adoptedStyleSheets) {
      updateAdoptedStylesheets(target, styleSheets);
    } else {
      updateStyleElement(target, styleSheets);
    }
    for (const marker of meta.markers) {
      const value2 = args[marker.index];
      let prevValue = void 0;
      if (meta.prevArgs) {
        prevValue = meta.prevArgs[marker.index];
        if (prevValue === value2 && !marker.forceUpdate) {
          continue;
        }
      }
      try {
        marker.fn(host, marker.node, value2, prevValue, useLayout);
      } catch (error2) {
        console.error(`Error while updating template expression in ${stringifyElement(host)}:
${beautifyTemplateLog(contents, marker.index)}`);
        throw error2;
      }
    }
    meta.prevArgs = args;
    return target;
  };
}

// node_modules/hybrids/src/template/helpers/index.js
var helpers_exports = {};
__export(helpers_exports, {
  resolve: () => resolve2,
  set: () => set3,
  transition: () => transition_default
});

// node_modules/hybrids/src/template/helpers/resolve.js
var promiseMap = new WeakMap();
function resolve2(promise, placeholder, delay = 200) {
  return function fn(host, target) {
    const useLayout = fn.useLayout;
    let timeout;
    if (placeholder) {
      timeout = setTimeout(() => {
        timeout = void 0;
        resolveValue(host, target, placeholder, void 0, useLayout);
      }, delay);
    }
    promiseMap.set(target, promise);
    promise.then((value2) => {
      if (timeout)
        clearTimeout(timeout);
      if (promiseMap.get(target) === promise) {
        resolveValue(host, target, value2, placeholder && !timeout ? placeholder : void 0, useLayout);
        promiseMap.set(target, null);
      }
    });
  };
}

// node_modules/hybrids/src/template/helpers/set.js
function resolveValue2({target, detail}, setter) {
  let value2;
  switch (target.type) {
    case "radio":
    case "checkbox":
      value2 = target.checked && target.value;
      break;
    case "file":
      value2 = target.files;
      break;
    default:
      value2 = detail && hasOwnProperty.call(detail, "value") ? detail.value : target.value;
  }
  setter(value2);
}
function getPartialObject(name, value2) {
  return name.split(".").reverse().reduce((acc, key2) => {
    if (!acc)
      return {[key2]: value2};
    return {[key2]: acc};
  }, null);
}
var stringCache = new Map();
function set3(property, valueOrPath) {
  if (!property) {
    throw Error(`The first argument must be a property name or an object instance: ${property}`);
  }
  if (typeof property === "object") {
    if (valueOrPath === void 0) {
      throw Error("For model instance property the second argument must be defined");
    }
    const store2 = storePointer.get(property);
    if (!store2) {
      throw Error("Provided object must be a model instance of the store");
    }
    if (valueOrPath === null) {
      return () => {
        store2.set(property, null);
      };
    }
    return (host, event) => {
      resolveValue2(event, (value2) => {
        store2.set(property, getPartialObject(valueOrPath, value2));
      });
    };
  }
  if (arguments.length === 2) {
    return (host) => {
      host[property] = valueOrPath;
    };
  }
  let fn = stringCache.get(property);
  if (!fn) {
    fn = (host, event) => {
      resolveValue2(event, (value2) => {
        host[property] = value2;
      });
    };
    stringCache.set(property, fn);
  }
  return fn;
}

// node_modules/hybrids/src/template/methods.js
var methods_exports = {};
__export(methods_exports, {
  css: () => css,
  key: () => key,
  style: () => style,
  use: () => use
});
function key(id) {
  this.id = id;
  return this;
}
function style(...styles) {
  this.styleSheets = this.styleSheets || [];
  this.styleSheets.push(...styles);
  return this;
}
function css(parts, ...args) {
  this.styleSheets = this.styleSheets || [];
  let result = parts[0];
  for (let index = 1; index < parts.length; index++) {
    result += (args[index - 1] !== void 0 ? args[index - 1] : "") + parts[index];
  }
  this.styleSheets.push(result);
  return this;
}
function use(plugin) {
  this.plugins = this.plugins || [];
  this.plugins.push(plugin);
  return this;
}

// node_modules/hybrids/src/template/index.js
var PLACEHOLDER = getPlaceholder();
var PLACEHOLDER_SVG = getPlaceholder("svg");
var PLACEHOLDER_LAYOUT = getPlaceholder("layout");
var templates = new Map();
function compile2(parts, args, id, isSVG, isMsg) {
  function fn(host, target) {
    if (fn.useLayout)
      id += PLACEHOLDER_LAYOUT;
    let render2 = templates.get(id);
    if (!render2) {
      render2 = compileTemplate(parts, isSVG, isMsg, fn.useLayout);
      templates.set(id, render2);
    }
    if (fn.plugins) {
      return fn.plugins.reduce((acc, plugin) => plugin(acc), () => render2(host, target, args, fn.styleSheets))(host, target);
    } else {
      return render2(host, target, args, fn.styleSheets);
    }
  }
  return Object.assign(fn, methods_exports);
}
function html(parts, ...args) {
  const id = parts.join(PLACEHOLDER);
  return compile2(parts, args, id, false, false);
}
function svg(parts, ...args) {
  const id = parts.join(PLACEHOLDER) + PLACEHOLDER_SVG;
  return compile2(parts, args, id, true, false);
}
Object.freeze(Object.assign(html, helpers_exports));

// node_modules/hybrids/src/localize.js
var dictionary = new Map();
var cache4 = new Map();
var translate = null;
var languages = (() => {
  let list;
  try {
    list = globalThis.navigator.languages || [globalThis.navigator.language];
  } catch (e) {
    list = [];
  }
  return list.reduce((set4, code) => {
    const codeWithoutRegion = code.split("-")[0];
    set4.add(code);
    if (code !== codeWithoutRegion)
      set4.add(codeWithoutRegion);
    return set4;
  }, new Set());
})();
function isLocalizeEnabled() {
  return translate !== null || dictionary.size;
}
var pluralRules = new Map();
function get3(key2, context2, args = []) {
  key2 = key2.trim().replace(/\s+/g, " ");
  context2 = context2.trim();
  const cacheKey = `${key2} | ${context2}`;
  let msg2 = cache4.get(cacheKey);
  if (!msg2) {
    if (dictionary.size) {
      for (const lang of languages) {
        const msgs = dictionary.get(lang);
        if (msgs) {
          msg2 = msgs[cacheKey] || msgs[key2];
          if (msg2) {
            msg2 = msg2.message;
            if (typeof msg2 === "object") {
              let rules2 = pluralRules.get(lang);
              if (!rules2) {
                rules2 = new Intl.PluralRules(lang);
                pluralRules.set(lang, rules2);
              }
              const pluralForms = msg2;
              msg2 = (number) => number === 0 && pluralForms.zero || pluralForms[rules2.select(number)] || pluralForms.other || "";
            }
            break;
          }
        }
      }
    }
    if (!msg2) {
      if (translate) {
        msg2 = translate(key2, context2);
      }
      if (!msg2) {
        msg2 = key2;
        if (dictionary.size || translate) {
          console.warn(`Missing translation: "${key2}"${context2 ? ` [${context2}]` : ""}`);
        }
      }
    }
    cache4.set(cacheKey, msg2);
  }
  return typeof msg2 === "function" ? msg2(args[0]) : msg2;
}
function getKeyInChromeI18nFormat(key2) {
  return key2.replace("$", "@").replace(/[^a-zA-Z0-9_@]/g, "_").toLowerCase();
}
function localize(lang, messages) {
  switch (typeof lang) {
    case "function": {
      const options = messages || {};
      if (options.format === "chrome.i18n") {
        const cachedKeys = new Map();
        translate = (key2, context2) => {
          key2 = context2 ? `${key2} | ${context2}` : key2;
          let cachedKey = cachedKeys.get(key2);
          if (!cachedKey) {
            cachedKey = getKeyInChromeI18nFormat(key2);
            cachedKeys.set(key2, cachedKey);
          }
          return lang(cachedKey, context2);
        };
      } else {
        translate = lang;
      }
      break;
    }
    case "string": {
      if (!messages || typeof messages !== "object") {
        throw TypeError("Messages must be an object");
      }
      if (lang === "default") {
        languages.add("default");
      }
      const current = dictionary.get(lang) || {};
      dictionary.set(lang, {...current, ...messages});
      break;
    }
    default:
      throw TypeError("The first argument must be a string or a function");
  }
}
Object.defineProperty(localize, "languages", {
  get: () => Array.from(languages)
});
function getString(parts, args) {
  let string = "";
  for (const [index, part] of parts.entries()) {
    string += index ? `\${${index - 1}}${part}` : part;
  }
  const [key2, , context2 = ""] = string.split("|");
  return get3(key2, context2, args);
}
var EXP_REGEX = /\$\{(\d+)\}/g;
function msg(parts, ...args) {
  return getString(parts, args).replace(EXP_REGEX, (_, index) => args[index]);
}
var PLACEHOLDER_MSG = getPlaceholder("msg");
var PLACEHOLDER_SVG2 = getPlaceholder("svg");
msg.html = function html2(parts, ...args) {
  const input = getString(parts, args);
  return compile2(input.replace(EXP_REGEX, (_, index) => getPlaceholder(index)), args, input + PLACEHOLDER_MSG, false, true);
};
msg.svg = function svg2(parts, ...args) {
  const input = getString(parts, args);
  return compile2(input.replace(EXP_REGEX, (_, index) => getPlaceholder(index)), args, input + PLACEHOLDER_MSG + PLACEHOLDER_SVG2, true, true);
};
export {
  children,
  debug,
  define_default as define,
  dispatch,
  html,
  localize,
  mount,
  msg,
  parent,
  router_default as router,
  store_default as store,
  svg
};
