import { applyTax } from "./tax";

if (applyTax(100) !== 125) throw new Error("tax");
