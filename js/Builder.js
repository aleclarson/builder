var ArrayOf, Builder, NamedFunction, Property, PropertyMapper, PureObject, Super, Tracer, applyChain, assert, assertType, bind, builderProps, define, emptyFunction, forbiddenKinds, frozen, hasEvents, inArray, initTypeCount, instanceID, instanceProps, instanceType, isType, mutable, ref, setKind, setType, sync, wrapValue;

require("isDev");

ref = Property = require("Property"), mutable = ref.mutable, frozen = ref.frozen;

NamedFunction = require("NamedFunction");

emptyFunction = require("emptyFunction");

PureObject = require("PureObject");

applyChain = require("applyChain");

assertType = require("assertType");

wrapValue = require("wrapValue");

inArray = require("in-array");

setType = require("setType");

setKind = require("setKind");

ArrayOf = require("ArrayOf");

Tracer = require("tracer");

isType = require("isType");

define = require("define");

assert = require("assert");

Super = require("Super");

bind = require("bind");

sync = require("sync");

PropertyMapper = require("./PropertyMapper");

hasEvents = Symbol("Builder.hasEvents");

module.exports = Builder = NamedFunction("Builder", function(name, func) {
  var self;
  self = Object.create(Builder.prototype);
  builderProps.define(self);
  if (name) {
    assertType(name, String);
    self._name = name;
  }
  if (func) {
    assertType(func, Function);
    self._kind = Function;
    self._createInstance = function() {
      var instance;
      instance = function() {
        return func.apply(instance, arguments);
      };
      if (isDev) {
        instance.toString = function() {
          return func.toString();
        };
      }
      return instance;
    };
  }
  if (isDev) {
    self._didBuild.push(initTypeCount);
    Object.defineProperty(self, "_tracer", {
      value: Tracer("Builder.construct()", {
        skip: 2
      })
    });
  }
  return self;
});

builderProps = Property.Map({
  _name: null,
  _kind: null,
  _createInstance: null,
  _initInstance: function() {
    return [];
  },
  _willBuild: function() {
    return [];
  },
  _didBuild: function() {
    return [];
  },
  _cachedBuild: null
});

instanceType = null;

if (isDev) {
  instanceID = null;
  initTypeCount = function(type) {
    return type.count = 0;
  };
  instanceProps = Property.Map({
    __id: function() {
      return instanceID;
    },
    __name: {
      get: function() {
        return this.constructor.getName() + "_" + this.__id;
      }
    }
  });
  forbiddenKinds = [String, Boolean, Number, Array, Symbol, Date, RegExp];
}

define(Builder, {
  building: {
    get: function() {
      return instanceType;
    }
  }
});

define(Builder.prototype, {
  inherits: function(kind) {
    assert(!this._kind, "'kind' is already defined!");
    assert(kind !== Object, "'Cannot explicitly inherit from Object! The default 'kind' is Object, so just dont call 'inherits'!");
    assert(kind !== Function, "Cannot explicitly inherit from Function! Must pass a second argument to the Builder constructor!");
    assert(!inArray(forbiddenKinds, kind), function() {
      return "Cannot inherit from '" + kind.name + "'!";
    });
    if (kind !== null) {
      assert(kind instanceof Function, "'kind' must be a kind of Function (or null)!");
    }
    this._kind = kind;
    this._willBuild.push(function() {
      return this._createInstance != null ? this._createInstance : this._createInstance = kind === null ? PureObject.create : function(args) {
        return kind.apply(null, args);
      };
    });
  },
  createInstance: function(createInstance) {
    assertType(createInstance, Function);
    assert(!this._createInstance, "'createInstance' is already defined!");
    assert(this._kind, "Must call 'inherits' before 'createInstance'!");
    this._createInstance = function(args) {
      return createInstance.apply(null, args);
    };
  },
  trace: function() {
    define(this, "_shouldTrace", true);
  },
  initInstance: function(func) {
    assertType(func, Function);
    this._initInstance.push(function(args) {
      return func.apply(this, args);
    });
  },
  defineValues: PropertyMapper({
    needsValue: true
  }),
  defineFrozenValues: PropertyMapper({
    frozen: true,
    needsValue: true
  }),
  defineReactiveValues: PropertyMapper({
    reactive: true,
    needsValue: true
  }),
  defineEvents: function(events) {
    var EventMap, kind;
    assertType(events, Object);
    EventMap = require("./inject/EventMap").get();
    assert(EventMap instanceof Function, "Must inject an 'EventMap' constructor before calling 'this.defineEvents'!");
    kind = this._kind;
    if (!this[hasEvents]) {
      frozen.define(this, hasEvents, true);
      if (!(kind && kind.prototype[hasEvents])) {
        this._didBuild.push(function(type) {
          return frozen.define(type.prototype, hasEvents, true);
        });
        this._initInstance.push(function() {
          return frozen.define(this, "_events", EventMap(events));
        });
      }
      this._didBuild.push(function(type) {
        return sync.keys(events, function(eventName) {
          return frozen.define(type.prototype, eventName, function(maxCalls, onNotify) {
            return this._events(eventName, maxCalls, onNotify);
          });
        });
      });
    }
  },
  defineProperties: function(props) {
    assertType(props, Object);
    props = sync.map(props, function(prop, key) {
      assertType(prop, Object, key);
      return Property(prop);
    });
    this._initInstance.push(function() {
      var key, prop;
      for (key in props) {
        prop = props[key];
        prop.define(this, key);
      }
    });
  },
  definePrototype: function(props) {
    assertType(props, Object);
    this._didBuild.push(function(type) {
      var key, prop;
      for (key in props) {
        prop = props[key];
        if (!isType(prop, Object)) {
          prop = {
            value: prop
          };
        }
        prop.frozen = true;
        define(type.prototype, key, prop);
      }
    });
  },
  defineMethods: function(methods) {
    var inherited, key, kind, method, prefix;
    assertType(methods, Object);
    prefix = this._name ? this._name + "#" : "";
    kind = this._kind;
    if (isDev) {
      for (key in methods) {
        method = methods[key];
        assertType(method, Function, prefix + key);
        if (kind) {
          inherited = Super.findInherited(kind, key);
          assert(!inherited, "Inherited methods cannot be redefined: '" + (prefix + key) + "'\n\nCall 'overrideMethods' to explicitly override!");
        }
      }
    }
    this._didBuild.push(function(type) {
      for (key in methods) {
        method = methods[key];
        mutable.define(type.prototype, key, method);
      }
    });
  },
  overrideMethods: function(methods) {
    var hasInherited, inherited, key, kind, method, prefix;
    assertType(methods, Object);
    kind = this._kind;
    assert(kind, "Must call 'inherits' before 'overrideMethods'!");
    prefix = this._name ? this._name + "#" : "";
    hasInherited = false;
    for (key in methods) {
      method = methods[key];
      assertType(method, Function, prefix + key);
      inherited = Super.findInherited(kind, key);
      assert(inherited, "Cannot find method to override for: '" + (prefix + key) + "'!");
      if (!Super.regex.test(method.toString())) {
        continue;
      }
      hasInherited = true;
      methods[key] = Super(inherited, method);
    }
    this._didBuild.push(function(type) {
      if (hasInherited) {
        Super.augment(type);
      }
      for (key in methods) {
        method = methods[key];
        mutable.define(type.prototype, key, method);
      }
    });
  },
  mustOverride: function(keys) {
    var name;
    assertType(keys, Array);
    this._didBuild.push(function(type) {
      var i, key, len;
      for (i = 0, len = keys.length; i < len; i++) {
        key = keys[i];
        mutable.define(type.prototype, key, emptyFunction);
      }
    });
    if (!isDev) {
      return;
    }
    name = this._name ? this._name + "#" : "";
    this._initInstance.push(function() {
      var i, key, len;
      for (i = 0, len = keys.length; i < len; i++) {
        key = keys[i];
        assert(this[key] instanceof Function, "Must override '" + name + key + "'!");
      }
    });
  },
  bindMethods: function(keys) {
    assert(isType(keys, ArrayOf(String)), "'bindMethods' must be passed an array of strings!");
    this._initInstance.push(function() {
      var i, key, len, meta;
      if (isDev) {
        meta = {
          obj: this
        };
      }
      for (i = 0, len = keys.length; i < len; i++) {
        key = keys[i];
        if (isDev) {
          meta.key = key;
        }
        assertType(this[key], Function, meta);
        this[key] = bind.method(this, key);
      }
    });
  },
  exposeGetters: function(keys) {
    var props;
    assertType(keys, Array);
    props = {};
    sync.each(keys, function(key) {
      var internalKey;
      internalKey = "_" + key;
      return props[key] = Property({
        get: function() {
          return this[internalKey];
        },
        enumerable: true
      });
    });
    this._didBuild.push(function(arg) {
      var key, prop, prototype;
      prototype = arg.prototype;
      for (key in props) {
        prop = props[key];
        prop.define(prototype, key);
      }
    });
  },
  exposeLazyGetters: function(keys) {
    var props;
    assertType(keys, Array);
    props = {};
    sync.each(keys, function(key) {
      var internalKey;
      internalKey = "_" + key;
      return props[key] = Property({
        get: function() {
          return this[internalKey].get();
        },
        enumerable: true
      });
    });
    this._didBuild.push(function(arg) {
      var key, prop, prototype;
      prototype = arg.prototype;
      for (key in props) {
        prop = props[key];
        prop.define(prototype, key);
      }
    });
  },
  defineStatics: function(statics) {
    var props;
    assertType(statics, Object);
    props = sync.map(statics, function(options, key) {
      if (!isType(options, Object)) {
        options = {
          value: options
        };
      }
      return Property(options);
    });
    this._didBuild.push(function(type) {
      var key, prop;
      for (key in props) {
        prop = props[key];
        prop.define(type, key);
      }
    });
  },
  addMixins: function(mixins) {
    var i, index, len, mixin;
    assertType(mixins, Array, "mixins");
    for (index = i = 0, len = mixins.length; i < len; index = ++i) {
      mixin = mixins[index];
      assertType(mixin, Function, "mixins[" + index + "]");
      mixin(this);
    }
  },
  willBuild: function(func) {
    assertType(func, Function);
    this._willBuild.push(func);
  },
  didBuild: function(func) {
    assertType(func, Function);
    this._didBuild.push(func);
  },
  construct: function() {
    return this.build().apply(null, arguments);
  },
  build: function() {
    var type;
    if (this._cachedBuild) {
      return this._cachedBuild;
    }
    applyChain(this._willBuild, this);
    type = this._createType();
    if (this._kind) {
      setKind(type, this._kind);
    }
    if (isDev) {
      frozen.define(type, "_builder", this);
    }
    applyChain(this._didBuild, null, [type]);
    return this._cachedBuild = type;
  },
  _createType: function() {
    var createArguments, createInstance, name, type;
    name = this._name || "";
    createArguments = this.__buildArgumentCreator();
    createInstance = this.__buildInstanceCreator();
    type = NamedFunction(name, function() {
      return createInstance(type, createArguments(arguments));
    });
    return type;
  },
  __buildArgumentCreator: function() {
    return emptyFunction.thatReturnsArgument;
  },
  __buildInstanceCreator: function() {
    var createBaseObject, createInstance, initInstance, shouldTrace;
    createBaseObject = this._createInstance;
    createBaseObject = createBaseObject ? wrapValue(createBaseObject, this.__migrateBaseObject) : this.__createBaseObject;
    initInstance = this._initInstance;
    shouldTrace = this._shouldTrace;
    return createInstance = function(type, args) {
      var instance;
      if (!instanceType) {
        instanceType = type;
        if (isDev) {
          instanceID = type.count++;
        }
      }
      instance = createBaseObject.call(null, args);
      if (instanceType) {
        instanceType = null;
        if (isDev) {
          instanceProps.define(instance);
          instanceID = null;
        }
      }
      if (isDev && shouldTrace) {
        if (!instance._tracers) {
          frozen.define(instance, "_tracers", Object.create(null));
        }
        instance._tracers.init = Tracer(this._name + "()");
      }
      applyChain(initInstance, instance, [args]);
      return instance;
    };
  },
  __migrateBaseObject: function(createInstance) {
    return function(args) {
      var instance;
      instance = createInstance.call(null, args);
      if (instanceType) {
        setType(instance, instanceType);
      }
      return instance;
    };
  },
  __createBaseObject: function() {
    return Object.create(instanceType.prototype);
  }
});

//# sourceMappingURL=map/Builder.map