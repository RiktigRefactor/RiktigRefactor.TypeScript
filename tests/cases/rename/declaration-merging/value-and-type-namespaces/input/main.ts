type /*|*/Meters = number;
const Unit = "m";

const length: Meters = 3;
if (`${length}${Unit}` !== "3m") throw new Error("length");
