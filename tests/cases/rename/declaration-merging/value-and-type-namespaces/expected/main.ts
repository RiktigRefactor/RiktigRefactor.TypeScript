type Unit = number;
const Unit = "m";

const length: Unit = 3;
if (`${length}${Unit}` !== "3m") throw new Error("length");
