const /*|*/offset = 100;
const shifted = [1, 2].map((item) => item + offset);

if (shifted.join() !== "101,102") throw new Error(shifted.join());
