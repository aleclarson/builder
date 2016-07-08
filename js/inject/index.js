var injectable;

injectable = {
  EventMap: require("./EventMap")
};

module.exports = function(key, value) {
  return injectable[key].inject(value);
};

//# sourceMappingURL=map/index.map