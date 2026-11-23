import { applyTax as addTax } from "./tax";

if (addTax(100) !== 125) throw new Error("tax");
