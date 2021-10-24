function ceildiv(x, y) {
  if (x > 0n) return ((x - 1n) / y) + 1n;
  return x / y;
}

module.exports = {
  ceildiv
};
